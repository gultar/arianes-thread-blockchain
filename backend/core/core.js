
/**
 * Core: {
 *      Server (Handles inbound connections, basic listeners defined here but any events related to blockchain defined elsewhere. Socket exported)
 *      Protocol (sendPeerMessage, receivePeerMessage -handlers not defined here. All functions exported)
 *      Discovery (Broadcasts possible new peer addresses through tokens)
 *      Class Peer (
 *                  - Creates new outbound connection
 *                  - Basic listeners defined here but any events related to blockchain defined elsewhere. 
 *                  - Authenticity of target peer is verified here through some chosen method
 *                  - Socket exported
 *      )
 *      Handlers (Requires access to Blockchain. Exports all handlers)
 *      Blockchain (Requires Mempool to be instanciated before. Exports Object)
 *      
 * }
 * 
 */
const CoreServer = require('./server/server')
const Blockchain = require('../classes/chain')
const Mempool = require('../classes/pool')
const sha256 = require('../tools/sha256')
const { logger } = require('../tools/utils')
const sha1 = require('sha1')

const { transactionHandler, actionHandler } = require('./handlers/handlers')

class NodeCore extends CoreServer{
    constructor({ host, port, httpsEnabled, config={}, controlAPI, minerAPI, discoverPeers }){
        let serverParams = { host:host, port:port, httpsEnabled, config:config, noLocalhost:config.noLocalhost  }
        super(serverParams)
        this.mempool = new Mempool()
        this.chain = new Blockchain([], this.mempool)
        this.genesis = config.genesis
        this.messageBuffer = {}
        this.peerMessageExpiration = 30 * 1000
        this.noLocalhost = config.noLocalhost || false;
        this.controlAPI = controlAPI || function(){}
        this.minerAPI = minerAPI || function(){}
        this.discoverPeers = discoverPeers || function(){}
    }

    async init(){
        let chainLoaded = await this.chain.init()
        let started = await this.start((socket)=>{
            this.onPeerMessage(socket)
            this.controlAPI(socket)
            this.discoverPeers()
        })
    }

    /**
        Basis for gossip protocol on network
        Generates a message uid to be temporarilly stored by all nodes
        to avoid doubles, then erased so that memory does not overflow.
        @param {string} $type - peer message type
    */
    sendPeerMessage(type, data){
        if(type){
            try{
                if(typeof data == 'object')
                data = JSON.stringify(data);
                //   var shaInput = (Math.random() * Date.now()).toString()
                
                var message = { 
                    'type':type, 
                    'messageId':'', 
                    'originAddress':this.address, 
                    'data':data,
                    'relayPeer':this.address,
                    'expiration':Date.now() + this.peerMessageExpiration// 30 seconds
                }
                let messageId = sha1(JSON.stringify(message));
                message.messageId = messageId
                this.broadcast('peerMessage', message);
                this.messageBuffer[messageId] = messageId;

            }catch(e){
                console.log(e);
            }

        }
    }

    onPeerMessage(socket){
        socket.on('peerMessage', async(peerMessage, acknowledge)=>{
            if(!this.messageBuffer[peerMessage.messageId]){
                await this.rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'peerMessage' events") }); // consume 1 point per event from IP
                
                this.handlePeerMessage(peerMessage, acknowledge);
            }
        })
    }

    /**
    @param {String} $type - Peer message type
    @param {String} $originAddress - IP Address of sender
    @param {Object} $data - Various data (transactions to blockHash). Contains messageId for logging peer messages
  */
  async handlePeerMessage({ type, originAddress, messageId, data, relayPeer, expiration }, acknowledge){
      
    if(data){
      try{
        let peerMessage = { 
          'type':type, 
          'originAddress':originAddress, 
          'messageId':messageId, 
          'data':data,
          'relayPeer':relayPeer,
          'expiration':expiration
        }
        
        if(peerMessage.expiration <= Date.now() + this.peerMessageExpiration){
          this.messageBuffer[messageId] = peerMessage;
          acknowledge({received:messageId})
            switch(type){
              case 'transaction':
                var transaction = JSON.parse(data);
                transactionHandler({
                    transaction,
                    transactionValidation:async (transaction)=>{
                        return await this.chain.validateTransaction(transaction)
                    },
                    verbose:true,
                    apiLog:()=>{},
                    addTransaction:async (transaction)=>{
                        return await this.mempool.addTransaction(transaction)
                    }
                });
                break;
              case 'action':
                let action = JSON.parse(data);
                actionHandler({
                    action,
                    actionValidation:async (action)=>{
                        return await this.chain.validateAction(action)
                    },
                    verbose:true,
                    apiLog:()=>{},
                    addAction:async (action)=>{
                        return await this.mempool.addAction(action)
                    }
                });
                break
              case 'newBlockFound':
                // if(!this.chain.isBusy){
                //   this.chain.isBusy = true
                //   let added = await this.handleNewBlockFound(data, originAddress, peerMessage);
                //   this.chain.isBusy = false;
                //   if(added){
                //     if(added.error){
                //       logger(chalk.red('REJECTED BLOCK:'), added.error)
                //     }

                //   }
                // }
                break;
              
            }
            this.broadcast('peerMessage', peerMessage)
        }else{
          logger(`Peer ${originAddress} sent an outdated peer message`)
        }
        
      }catch(e){
        console.log(e)
      }  
    }
    
  }
}

module.exports = NodeCore

