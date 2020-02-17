const ioClient = require('socket.io-client')
const { logger } = require('../tools/utils')
const compareSnapshots = require('./snapshotHandler')
const chalk = require('chalk')

class PeerManager{
    constructor({ address, host, lanHost, lanAddress, connectionsToPeers, networkManager, nodeList, receiveBlockchainStatus, buildBlockchainStatus, UILog, verbose, noLocalhost, networkPassword }){
        this.address = address
        this.host = host
        this.lanHost = lanHost
        this.lanAddress = lanAddress
        this.connectionsToPeers = connectionsToPeers
        this.nodeList = nodeList
        this.networkManager = networkManager
        this.receiveBlockchainStatus = receiveBlockchainStatus
        this.buildBlockchainStatus = buildBlockchainStatus
        this.UILog = UILog
        this.verbose = verbose
        this.noLocalhost = noLocalhost
        this.peerSnapshots = {}
        this.networkPassword = networkPassword || false
    }

    /**
        Basis for P2P connection
    */
    connectToPeer(address, callback){
        
        if(address && this.address != address){
            if(!this.connectionsToPeers[address]){

                //This is to enable connections on the same machine, if disabled, can only connect to remote nodes
                if(!this.noLocalhost){
                    if(address.includes(this.host) && (this.host !== '127.0.0.1' || this.host !== 'localhost')){
                        let [ prefix, hostAndPort ] = address.split('://')
                        let [ host, port ] = hostAndPort.split(':')
                        address = `${prefix}://${this.lanHost}:${port}`
                        // console.log('NEW ADDRESS', address)
                    }else{
                        let [ prefix, hostAndPort ] = address.split('://')
                        let [ host, port ] = hostAndPort.split(':')
                        address = `${prefix}://127.0.0.1:${port}`
                    }
                }
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
                            let password = false
                            if(genesis.passwordHash){
                                password = this.networkPassword
                            }
                            peer.emit('authentication', networkConfig, password);
                            peer.on('authenticated',async  (response)=>{
                                // console.log(JSON.stringify(response, null, 2))
                                if(response.success){
                                    this.connectionsToPeers[address] = peer;
                                    logger(chalk.green('Connected to ', address))
                                    this.UILog('Connected to ', address)
                                    
                                    peer.emit('message', 'Connection established by '+ this.address);
                                    let status = await this.buildBlockchainStatus()
                                    peer.emit('connectionRequest', this.address);
                                    this.nodeList.addNewAddress(address) 
                                    

                                    this.onPeerAuthenticated(peer)
                                    

                                    setTimeout(async()=>{
                                        peer.emit('getBlockchainStatus', status);
                                        peer.emit('getPeers')
                                        peer.emit('getChainSnapshot')
                                        
                                    },2000);
                                }else{
                                    logger('Could not connect to remote node', response)
                                    if(response.network){
                                        let exists = this.networkManager.getNetwork(response.network.network)
                                        if(!exists){
                                            let added = await this.networkManager.addNetwork(response.network)
                                            if(added.error) logger('NETWORK ERROR', added.error)
                                            logger('Discovered new network ', response.network.network)
                                        }
                                    }
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

    getPeer(address){
        return this.connectionsToPeers[address]
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

        peer.on('chainSnapshot', (snapshot)=>{
            //if(isValidSnapshotJSON)
            this.peerSnapshots[peer.address] = snapshot
        })

        peer.on('disconnect', () =>{
            let address = peer.address
            logger(`connection with peer ${address} dropped`);
            delete this.connectionsToPeers[address];
            delete this.peerSnapshots[address]
            peer.disconnect()
        })
    }

    getSnapshot(address){
        return this.peerSnapshots[address]
    }

    requestChainSnapshot(peer){
        return new Promise((resolve)=>{
            peer.on('chainSnapshot', snapshot => {
                clearTimeout(noAnswer)
                peer.off('chainSnapshot')
                resolve(snapshot)
            })
            peer.emit('getChainSnapshot')
            let noAnswer = setTimeout(()=>{
                resolve(false)
            }, 5000)
        })
    }


}

module.exports = PeerManager