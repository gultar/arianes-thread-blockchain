
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
                if(!this.chain.isBusy){
                    if(!this.isDownloading){
                        this.chain.isBusy = true
                  
                  
                        this.emit('isBusy', 'shit')
                            //   let added = await this.handleNewBlockFound(data, originAddress, peerMessage);
                        let added
                        this.chain.isBusy = false;
                        this.emit('isAvailable')
                        if(added && added.error) logger(chalk.red('REJECTED BLOCK:'), added.error)
                    }else{
                        console.log('ERROR: Node is busy, could not add block')
                    }
                  
                }
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

  handleNewBlockFound(data, fromPeer, peerMessage){
    return new Promise( async (resolve)=>{
      if(this.chain instanceof Blockchain && data){
        if(!this.isDownloading){
          try{

            let block = JSON.parse(data);
            let alreadyReceived = await this.chain.getBlockbyHash(block.hash)
            let alreadyIsInActiveBranch = this.chain.branches[block.hash];
  
            if(!alreadyReceived && !alreadyIsInActiveBranch){
              //Need to validate more before stopping miner

              if(this.chain.validateBlockHeader(block)){

                this.peersLatestBlocks[fromPeer] = block

                let minerOn = this.localServer && this.localServer.socket
                
                this.isValidatingPeerBlock = true

                if(minerOn){
                  this.localServer.socket.emit('stopMining', block)
                  this.localServer.socket.isBuildingBlock = false
                  let putback = await this.mempool.deleteTransactionsOfBlock(block.transactions)
                  if(putback.error) resolve({error:putback.error})
                  if(block.actions){
                    let actionsPutback = await this.mempool.deleteActionsOfBlock(block.actions)
                    if(actionsPutback.error) resolve({error:actionsPutback.error})
                  }
                }

                
                let added = await this.chain.pushBlock(block);
                if(added.error){
                  this.isValidatingPeerBlock = false
                  resolve({error:added.error})
                }
                else{
                  let currentLength = this.chain.length;

                  this.isValidatingPeerBlock = false
                  //If not linked, stop mining after pushing the block, to allow more time for mining on this node
                  if(added.findMissing){
                    
                    let fixed = await this.fixUnlinkedBranch(added.findMissing);
                    if(fixed.error) resolve({error:fixed.error})
                    else resolve(fixed)

                  }else if(added.switched && added.switched.outOfSync){
                    
                    let rolledback = await this.chain.rollbackToBlock(currentLength - 5)
                    this.broadcast('getBlockchainStatus')
                    resolve(rolledback)
                  }else if(added.unlinked){
                    
                    let fixed = await this.fixUnlinkedBranch(added.unlinked);
                    if(fixed.error) resolve({error:fixed.error})
                    else resolve(fixed)

                  }else if(added.unlinkedExtended){
                    
                    let fixed = await this.fixUnlinkedBranch(added.unlinkedExtended);
                    if(fixed.error) resolve({error:fixed.error})
                    else resolve(fixed)
                    
                  }else{
                    if(minerOn){
                      this.localServer.socket.emit('latestBlock', this.chain.getLatestBlock())
                      this.localServer.socket.hasSentBlock = false
                    }
                    
                    resolve(added)
                  }
                }
  
              }else{
                resolve({error:'ERROR:New block header is invalid'})
              }
            }else{
              resolve({error:'ERROR: Block already received'})
            }
          }catch(e){
            resolve({error:e.message})
          }
        }else{
          resolve({error:'ERROR: Node is busy, could not add block'})
        }
      }else{
        resolve({error:'ERROR: Missing parameters'})
      }
    })
    
  }
}

module.exports = NodeCore

