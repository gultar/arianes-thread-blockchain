const dnssd = require('dnssd');
const isIP = require('is-ip');
const EventEmitter = require('events').EventEmitter
const Swarm = require('discovery-swarm')
const { randomBytes } = require('crypto')
const { logger } = require('../tools/utils')
const genesis = require('../tools/getGenesis')

class PeerDiscovery{

    constructor(opts){
        let { address, host, port, knownPeers } = opts
        this.channel = genesis.network || 'mainnet';
        this.address = address;
        this.host = host;
        this.port = port;
        this.knownPeers = knownPeers || {}
        this.service;
        this.browser;
        this.swarm;
        this.emitter = new EventEmitter()
    }

    find(){
        return new Promise(()=>{
            this.initBrowser()
            this.initService()
            setTimeout(async ()=>{
                let stoppedBrowser = await this.stopBrowser()
                let stoppedService = await this.stopService()
                resolve(true)
            }, 20000)
        })
    }

    initBrowser(){
        this.browser = dnssd.Browser(dnssd.tcp(this.channel))
        .on('serviceUp', service => {
            this.discoverNewPeer(service)
        })
        .start();
    }

    initService(){

        this.service = new dnssd.Advertisement(dnssd.tcp(this.channel), this.port, {
            fullname:this.address,
            name:this.address,
            host:this.host
        });
        this.service.start();

        this.emitter.on('peerGone', (address)=> delete this.knownPeers[address] )
    }

    stopBrowser(){
        return new Promise((resolve)=>{
            this.browser.stop((stopped)=>{
                logger('DNSSD Browser stopped')
                resolve(true)
            })
        })
    }

    stopService(){
        return new Promise((resolve)=>{
            this.service.stop((stopped)=>{
                logger('DNSSD Service stopped')
                resolve(true)
            })
        })
    }

    searchDHT(){
        return new Promise((resolve)=>{
            logger('Looking for peers on Bittorrent DHT')
            let potentialPeers = {}
            this.swarm = Swarm({
                id: randomBytes(32).toString('hex'), // peer-id for user
                utp: false, // use utp for discovery
                tcp: true, // use tcp for discovery
                maxConnections: 10,
            })
            
            this.swarm.listen(this.port)
            this.swarm.on('connection', (connection, peer) => {
                if(connection){
                    if(isIP.v4(peer.host) && peer.host != 'localhost'){
                        let nodePort = parseInt(peer.port) + 2000 //To be changed and fixed to a port number
                        let address = `https://${peer.host}:${nodePort}`;
                        peer.address = address
                        this.emitter.emit('peerDiscovered', peer)
                    }
                    
                } 
                // console.log('connection', connection)
            })
            this.swarm.on('peer', function(peer) {
                
                let address = `${peer.host}:${peer.port}`
                potentialPeers[address] = {
                    peer:peer,
                    connected:false,
                }
            })
            this.swarm.join(this.channel)
            resolve(true)
        })
        
    }

    collectPeers(callback){
        callback(this.emitter)
    }

    discoverNewPeer(service, callback){

        let contact = {
            host:'',
            port:'',
            address:'',
        }
        service.addresses.forEach((address)=>{
            if(isIP.v4(address)){
                if(!this.knownPeers[address] && this.address != address){
                    contact.host = address;
                    contact.port = service.port
                    contact.address = service.name
                    contact.lastSeen = Date.now()
                    if(!this.knownPeers[address]){
                        this.knownPeers[address] = contact
                        this.emitter.emit('peerDiscovered', contact)
                    }
                }
            }
        })
        
    }

    cleanUpPeers(){
        let peerAddresses = Object.keys(this.knownPeers);
        peerAddresses.forEach( address=>{
            if(this.knownPeers[address]){
                if(this.knownPeers[address].lastSeen < Date.now - (24 * 60 * 1000)){
                    this.emitter.emit('peerInactive', this.knownPeers[address])
                    delete this.knownPeers[address]
                }

            }
        })
    }

    close(){
        this.swarm.destroy(()=>{
            this.emitter.removeAllListeners('peerDiscovered')
            logger('DHT Peer discovery stopped')
        })
    }
}

module.exports = PeerDiscovery