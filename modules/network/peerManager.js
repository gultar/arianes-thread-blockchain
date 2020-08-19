const ioClient = require('socket.io-client')
const { logger } = require('../tools/utils')
const chalk = require('chalk')
const ReputationTable = require('./reputationTable')
const Peer = require('./peer')

class PeerManager{
    constructor({ 
        address, 
        host, 
        lanHost, 
        lanAddress, 
        connectionsToPeers, 
        networkManager, 
        nodeList, 
        receiveBlockchainStatus, 
        buildBlockchainStatus, 
        UILog, 
        verbose, 
        noLocalhost }){
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
        this.peerStatus = {}
        this.reputationTable = new ReputationTable()
    }

    async connect(address){
        if(!address || this.address == address) return false
        if(this.connectionsToPeers[address]) return this.connectionsToPeers[address]

        if(!this.noLocalhost){
            if(address.includes(this.host) && (this.host !== '127.0.0.1' || this.host !== 'localhost')){
                let [ prefix, hostAndPort ] = address.split('://')
                let [ host, port ] = hostAndPort.split(':')
                address = `${prefix}://${this.lanHost}:${port}`
            }else{
                let [ prefix, hostAndPort ] = address.split('://')
                let [ host, port ] = hostAndPort.split(':')
                address = `${prefix}://127.0.0.1:${port}`
            }
        }

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

        let peer = new Peer({
            address:address,
            connectionsToPeers:this.connectionsToPeers,
            verbose:this.verbose,
            config: config,
            buildBlockchainStatus:() => this.buildBlockchainStatus(),
            receiveBlockchainStatus:(peer, status) => this.receiveBlockchainStatus(peer, status),
            UILog:(...message)=> this.UILog(...message),
        })

        let connected = await peer.connect(networkConfig)

        return connected

    }

    /**
        Basis for P2P connection
    */
    connectToPeer(address){
        
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

                    let peerReputation = this.reputationTable.getPeerReputation(address)
                    if(peerReputation == 'untrusted'){
                        logger(`Refused connection to untrusted peer ${address}`)
                        response.success = false
                        return { willNotConnect:'Peer is untrustworthy' }
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
                                
                                if(!peerReputation){
                                    logger(`New peer is unkown. Creating new reputation entry`)
                                    let created = await this.reputationTable.createPeerReputation(address)
                                    if(created.error){
                                        logger('Could not create peer reputation entry. An error occured')
                                        logger(created.error)
                                    }
                                }

                                if(response.success){
                                    this.connectionsToPeers[address] = peer;
                                    logger(chalk.green('Connected to ', address))
                                    this.UILog('Connected to ', address)
                                    
                                    peer.emit('message', 'Connection established by '+ this.address);
                                    let status = await this.buildBlockchainStatus()
                                    peer.emit('connectionRequest', this.address);
                                    this.nodeList.addNewAddress(address) 
                                
                                    this.requestNewPeers(peer)
                                    this.onPeerAuthenticated(peer)

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

    requestNewPeers(peer){
        peer.once('newPeers', async (peers)=> {
            if(peers && peers.length){
               for await(let addr of peers){
                    if(!this.nodeList.addresses.includes(addr) && !this.nodeList.blackListed.includes(addr)){
                        this.nodeList.addNewAddress(addr)
                    }
                    if(!this.connectionsToPeers[addr]){
                        this.connectToPeer(addr)
                    }
               }
            }
        })
        //Request known addresses from new peer
        peer.emit('getPeers')
    }

    onPeerAuthenticated(peer){

        peer.on('blockchainStatus', async (status)=>{
            let updated = await this.receiveBlockchainStatus(peer, status)
            if(updated.error) logger(chalk.red('CHAIN STATUS'), updated.error)
            else if(updated.busy) logger(chalk.yellow('CHAIN STATUS:', updated.busy))
        })

        peer.on('disconnect', () =>{
            this.disconnect(peer)
        })
    }

    disconnect(peer){
        if(peer){
            let address = peer.address
            logger(`connection with peer ${address} dropped`);
            delete this.connectionsToPeers[address];
            delete this.peerSnapshots[address]
            peer.disconnect()
        }else{
            return 'disconnected'
        }
    }

    async lowerReputation(peerAddress, reason='spammed'){
        let peer = this.connectionsToPeers[peerAddress]

        let decreased = await this.reputationTable.decreaseReputationScore(peerAddress, reason)
        console.log('Decreased',decreased)
        if(decreased.error) return { error:decreased.error }
        let reputation = await this.reputationTable.getPeerReputation(peerAddress)
        if(reputation){
            logger(`Peer ${peerAddress} reputation:`, reputation)

            if(reputation == 'untrusted'){
                logger('Forcing disconnection from peer')
                this.disconnect(peer)
                return { disconnected:true }
            }
        }
    }

}

module.exports = PeerManager