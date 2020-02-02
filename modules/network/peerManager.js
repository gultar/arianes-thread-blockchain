const ioClient = require('socket.io-client')
const { logger } = require('../tools/utils')
const chalk = require('chalk')

class PeerManager{
    constructor({ address, connectionsToPeers, networkManager, nodeList, receiveBlockchainStatus, buildBlockchainStatus, UILog, verbose, noLocalhost }){
        this.address = address
        this.connectionsToPeers = connectionsToPeers
        this.nodeList = nodeList
        this.networkManager = networkManager
        this.receiveBlockchainStatus = receiveBlockchainStatus
        this.buildBlockchainStatus = buildBlockchainStatus
        this.UILog = UILog
        this.verbose = verbose
        this.noLocalhost = noLocalhost
    }

    /**
        Basis for P2P connection
    */
    connectToPeer(address, callback){
        
        if(address && this.address != address){
            if(!this.connectionsToPeers[address]){
                
                let connectionAttempts = 0;
                let peer;
                try{
                    let networkConfig = this.networkManager.getNetwork()
                    let token = {
                        address:this.address,
                        networkConfig:networkConfig
                    }
                    
                    let config = {
                        'reconnection limit' : 1000,
                        'max reconnection attempts' : 3,
                        'pingInterval': 200, 
                        'pingTimeout': 10000,
                        'secure':true,
                        'rejectUnauthorized':false,
                        'query':
                        {
                            token: JSON.stringify(token),
                        }
                    }

                    if(this.noLocalhost && (address.includes('localhost') || address.includes('127.0.0.1') || address.includes('0.0.0.0'))){
                        logger('Connections to localhost not allowed')
                        return null;
                    }
                    
                    peer = ioClient(address, config);
                    peer.heartbeatTimeout = 120000;
                    peer.address = address

                    if(this.verbose) logger('Requesting connection to '+ address+ ' ...');
                    this.UILog('Requesting connection to '+ address+ ' ...');

                    peer.on('connect_timeout', (timeout)=>{
                        if(connectionAttempts >= 3) { 
                            peer.destroy()
                        }else{
                            connectionAttempts++;
                        }
                        
                    })

                    peer.on('error', (error)=>{
                        console.log(error)
                    })


                    peer.on('connect', async () =>{
                        if(!this.connectionsToPeers[address]){
                            
                            peer.emit('authentication', networkConfig);
                            peer.on('authenticated',async  (response)=>{
                                if(response.success){
                                    this.connectionsToPeers[address] = peer;
                                    logger(chalk.green('Connected to ', address))
                                    this.UILog('Connected to ', address)
                                    
                                    peer.emit('message', 'Connection established by '+ this.address);
                                    let status = await this.buildBlockchainStatus()
                                    peer.emit('connectionRequest', this.address);
                                    this.nodeList.addNewAddress(address)  
                                    this.onPeerAuthenticated(peer)
                                    

                                    setTimeout(()=>{
                                        peer.emit('getBlockchainStatus', status);
                                        peer.emit('getPeers')
                                    },2000);
                                }else{
                                    logger('WARNING: Could not connect to peer '+address)
                                    peer.disconnect()
                                }
                                
                            });
                            
                        
                        
                        }else{}
                    })

                    

                    if(callback){
                        callback(peer)
                    }

                }catch(err){
                    console.log(err)
                }

            }else{
                // logger('Already initiated peer connection')
            }

        }
    }

    onPeerAuthenticated(peer){
        peer.on('newPeers', (peers)=> {
            if(peers && typeof peers == Array){
                peers.forEach(addr =>{
                    //Validate if ip address
                    logger('Peer sent a list of potential peers')
                    if(!this.nodeList.addresses.includes(addr) && !this.nodeList.blackListed.includes(addr)){
                        this.nodeList.addNewAddress(addr)
                    }
                })
            }
        })

        peer.on('blockchainStatus', async (status)=>{
            let updated = await this.receiveBlockchainStatus(peer, status)
            if(updated.error) console.log(updated.error)
        })

        peer.on('disconnect', () =>{
            let address = peer.address
            logger(`connection with peer ${address} dropped`);
            delete this.connectionsToPeers[address];
            peer.disconnect()
        })
    }
}

module.exports = PeerManager