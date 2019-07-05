const dnssd = require('dnssd');
const isIP = require('is-ip');
const EventEmitter = require('events').EventEmitter

class PeerDiscovery{

    constructor(opts){
        let { address, host, port, channel } = opts
        this.channel = channel || 'mainnet';
        this.address = address;
        this.host = host;
        this.port = port;
        this.service;
        this.browser;
        this.knownPeers = {}
        this.emitter = new EventEmitter()
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