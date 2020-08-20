const ioClient = require('socket.io-client')
const { logger } = require('../tools/utils')
const chalk = require('chalk')
const EventEmitter = require('events')

class Peer{
    constructor({
        nodeAddress, 
        address, 
        connectionsToPeers, 
        buildBlockchainStatus, 
        receiveBlockchainStatus,
        UILog,
        verbose,
        config  }){
        this.nodeAddress = nodeAddress
        this.address = address
        this.socket = {}
        this.connectionsToPeers = connectionsToPeers
        this.verbose = verbose
        this.UILog = UILog
        this.buildBlockchainStatus = buildBlockchainStatus
        this.receiveBlockchainStatus = receiveBlockchainStatus
        this.config = config
        this.newPeersEvent = new EventEmitter()
    }

    connect(networkConfig){
        return new Promise((resolve, reject)=>{
            try{
                if(!this.connectionsToPeers[this.address]){
                    let connectionAttempts = 0;
                    logger('Connecting to '+ this.address+ ' ...')
                    this.socket = ioClient(this.address, this.config);
                    this.socket.heartbeatTimeout = 120000;
                    this.socket.address = this.address
                    if(this.verbose) logger('Connecting to '+ this.address+ ' ...');
                    this.UILog('Requesting connection to '+ this.address+ ' ...');
                    this.socket.on('error', e =>  { reject(e) })
                    this.socket.on('connect_timeout', (timeout)=>{
                        if(connectionAttempts >= 3)  this.socket.destroy()
                        else connectionAttempts++;
                    })
                    this.socket.on('connect', async () => {
                        if(!this.connectionsToPeers[this.address]){
                            let authenticated = await this.authenticate(networkConfig)
                            if(authenticated.success) {
                                
                                let newPeers = await this.requestNewPeers()
                                console.log('New peers:', newPeers)
                                for await(let peerAddress of newPeers){
                                    this.newPeersEvent.emit('newPeer', peerAddress)
                                }
                                this.onPeerAuthenticated()

                                resolve(this.socket)
                            }
                            else{
                                this.disconnect()
                                resolve(false)
                            }

                            
                        }else{
                            logger('ERROR: Cannot connect same peer twice')
                            this.socket.destroy()
                            resolve(false)
                        }
                    })
                }else{
                    logger(`Peer ${this.address} already connected`)
                    resolve(false)
                }
            }catch(e){
                logger(chalk.red('PEER ERROR'), e)
                this.socket.destroy()
                reject(e)
            }
        })
    }

    authenticate(networkConfig){
       return new Promise((resolve)=>{
            this.socket.emit('authentication', networkConfig);
            this.socket.on('authenticated', (response)=>{
                if(response.success) resolve({ success:response.success })
                else{
                    logger('Remove node refused connection')
                    this.socket.destroy()
                    resolve({ failed:response })
                }
            })
       })
    }
    
    requestNewPeers(){
        return new Promise((resolve)=>{
            this.socket.once('newPeers', async (peers)=> {
                console.log('PEERS', peers)
                if(peers && peers.length){
                    clearTimeout(timeout)
                    resolve(peers)
                }
            })
            //Request known addresses from new peer
            this.socket.emit('getPeers')
            let timeout = setTimeout(()=>{
                resolve([])
            }, 2000)
        })
    }

    onPeerAuthenticated(){
        this.connectionsToPeers[this.address] = this.socket;
        logger(chalk.green('Connected to ', this.address))
        this.UILog('Connected to ', this.address)
        this.socket.emit('message', 'Connection established by '+ this.address);
        
        
        this.socket.on('blockchainStatus', async (status)=>{
            let updated = await this.receiveBlockchainStatus(this.socket, status)
            if(updated.error) logger(chalk.red('CHAIN STATUS'), updated.error)
            else if(updated.busy) logger(chalk.yellow('CHAIN STATUS:', updated.busy))
        })
        this.socket.emit('connectionRequest', this.nodeAddress);

        this.socket.on('disconnect', () =>{
            this.disconnect()
        })
    }

    disconnect(){
        if(this.socket){
            logger(`connection with peer ${this.address} dropped`);
            delete this.connectionsToPeers[this.address];
            this.socket.destroy()
            delete this.socket
        }else{
            return 'disconnected'
        }
    }

}

module.exports = Peer