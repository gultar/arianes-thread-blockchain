var swarm = require('discovery-swarm')
const NodeList = require('../classes/nodelist')
const { logger } = require('./utils')

class PeerDiscovery{
    constructor(opts){
        this.host = opts.host || '127.0.0.1';
        this.port = opts.port || 32110;
        this.channel = opts.channel || 'mainnet'
        this.swarm = swarm({
            id: randomBytes(32).toString('hex'), // peer-id for user
            utp: false, // use utp for discovery
            tcp: true, // use tcp for discovery
            maxConnections: 10, // max number of connections.
          })
        
        this.peerList = {}
    }

    listen(){
        logger('Listening on ', this.port)
        this.swarm.listen(this.port)
        
    }

    waitForPeers(){
        this.swarm.on('connection', connection => { console.log('Connected to peer') })
        this.swarm.on('handshaking', function(connection, info) {
            console.log('Handshaking',info)
        })
    }

    debug(){
        this.swarm.on('peer', function(peer) { 
            // console.log('New peer', peer)
            console.log('Queued', sw.queued)
            console.log('Connected', sw.connected)
            console.log('Connecting', sw.connecting)
        })
            this.swarm.on('connecting', function(peer) { console.log('Attempting to connect') })
            this.swarm.on('drop', function(peer) { console.log('Peer dropped', peer.id) })
            this.swarm.on('peer-rejected', function(peerAddress, details) { 
            console.log('Peer rejected', details)
        })
  
        
        this.swarm.on('connect-failed', function(peer, details) { 
            console.log(`Connect failed with ${peer.id}`, details)
        })
    }


}