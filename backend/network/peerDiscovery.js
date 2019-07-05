const dnssd = require('dnssd');
const isIP = require('is-ip');
const EventEmitter = require('events')

class PeerDiscovery{

    constructor(opts){
        super()
        let { address, host, port, channel } = opts
        this.channel = channel || 'mainnet';
        this.address = address;
        this.host = host;
        this.port = port;
        this.service;
        this.browser;
        this.knownPeers = {}
    }

    initBrowser(){
        this.browser = dnssd.Browser(dnssd.tcp(this.channel))
        .on('serviceUp', service => {
            console.log(service)
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

        this.on('peerGone', (address)=> delete this.knownPeers[address] )
    }



    discoverNewPeer(service){

        let contact = {
            host:'',
            port:'',
            address:'',
        }
        service.addresses.forEach((address)=>{
            if(isIP.v4(address)){
                if(!this.knownPeers[address]){
                    
                    contact.host = address;
                    contact.port = service.port
                    contact.address = service.name
                    this.knownPeers[address] = contact
                    let emitter = new EventEmitter()
                    emitter.send('peerDiscovered', contact)
                }
            }
        })
        
    }
}

module.exports = PeerDiscovery