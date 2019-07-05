const dnssd = require('dnssd');
const isIP = require('is-ip');
const EventEmitter = require('events').EventEmitter
const Swarm = require('discovery-swarm')
const { randomBytes } = require('crypto')
const { logger } = require('../tools/utils')

class PeerDiscovery{

    constructor(opts){
        let { address, host, port, channel } = opts
        this.channel = channel || 'blockchain-mainnet';
        this.address = address;
        this.host = host;
        this.port = port;
        this.service;
        this.browser;
        this.knownPeers = {}
        this.emitter = new EventEmitter()
    }

    find(){
        return new Promise(()=>{
            this.initBrowser()
            this.initService()
            setTimeout(async ()=>{
                let stopped = await this.stopBrowser()
                let stopped = await this.stopService()
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
                resolve(true)
            })
        })
    }

    stopService(){
        return new Promise((resolve)=>{
            this.service.stop((stopped)=>{
                resolve(true)
            })
        })
    }

    findPeersOnBittorrentDHT(){
        return new Promise((resolve)=>{
            logger('Looking for peers on Bittorrent DHT')
            let potentialPeers = {}
            let sw = Swarm({
                id: randomBytes(32).toString('hex'), // peer-id for user
                utp: false, // use utp for discovery
                tcp: true, // use tcp for discovery
                maxConnections: 10,
            })
            sw.listen(this.port)
            sw.on('connection', (connection, peer) => {
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
            sw.on('peer', function(peer) {
                let address = `${peer.host}:${peer.port}`
                potentialPeers[address] = {
                    peer:peer,
                    connected:false,
                }
            })
            sw.join(this.channel)
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
                    this.knownPeers[address] = contact
                    this.emitter.emit('peerDiscovered', contact)
                }
            }
        })
        
    }
}

module.exports = PeerDiscovery