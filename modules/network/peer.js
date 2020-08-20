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
    }

    connect(networkConfig){
        return new Promise((resolve, reject)=>{
            try{
                if(!this.connectionsToPeers[this.address]){
                    let connectionAttempts = 0;
                    
                    this.socket = ioClient(this.address, this.config);
                    this.socket.heartbeatTimeout = 120000;
                    this.socket.address = this.address

                    logger('Connecting to '+ this.address+ ' ...');
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
                                this.onPeerAuthenticated()
                                resolve(this.socket)
                            }else{
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
                    logger('Remote node refused connection')
                    resolve({ failed:response })
                }
            })
       })
    }

    onPeerAuthenticated(){
        this.connectionsToPeers[this.address] = this.socket;
        
        logger(chalk.green('Connected to ', this.address))
        this.UILog('Connected to ', this.address)
        
        
        this.socket.on('disconnect', () => this.disconnect())
        this.socket.on('blockchainStatus', async (status)=>{
            let updated = await this.receiveBlockchainStatus(this.socket, status)
            if(updated.error) logger(chalk.red('CHAIN STATUS'), updated.error)
            else if(updated.busy) logger(chalk.yellow('CHAIN STATUS:', updated.busy))
        })
        this.socket.emit('connectionRequest', this.nodeAddress);
        this.socket.emit('message', 'Connection established by '+ this.nodeAddress);

        
    }

    disconnect(authFailed=false){
        if(this.socket){
            
            if(authFailed ) logger(`Refused connection to peer ${this.address}`)
            else logger(`Peer connection with ${this.address} dropped`);
            
            delete this.connectionsToPeers[this.address];
            this.socket.destroy()
            delete this.socket
        }else{
            return 'disconnected'
        }
    }

}

module.exports = Peer