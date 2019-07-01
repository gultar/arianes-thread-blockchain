
const SocketServer = require('socket.io')
const PeerConnection = require('socket.io-client')
const { logger } = require('../../tools/utils')
const sha1 = require('sha1')

class P2P{
    constructor({ host, port }){
        this.address = `http://${host}:${port}`;
        this.id = sha1(sha1(this.address))
        this.httpServer = require('http').createServer()
        this.host = host;
        this.port = port;
        this.ioServer = SocketServer(this.httpServer, { transport:['websocket'] });
        this.inbound = {};
        this.outbound = {};
        this.frontNode = {};
        this.backNode = {};
        this.knownNodes = []
        this.bootstrapNodes = [];
    }

    start(){
        return new Promise((resolve)=>{
            logger(`RPC Interface listening on ${this.address}`)
            this.ioServer.listen(this.port)
            
            this.ioServer.on('connection', (socket)=>{
                let address = socket.request.connection.remoteAddress;
                if(!this.inbound[address]){
                    this.inbound[address] = socket;
                    this.inboundChannels(socket, address)
                    
                }else{
                    socket.destroy()
                }
            
            })
            resolve(socket)
        })
        
    }

    connect(peerAddress, next){
        if(!this.outbound[peerAddress]){
            let peer = PeerConnection(peerAddress, { transport: ['websocket'] })
            if(peer){
                
                this.outboundChannels(peer, peerAddress)
                if(next) next(peer)
            }
        }
    }

    inboundChannels(socket, address){
        socket.on('message', (message)=>{
            logger(`Peer: ${message}`)
        })

        socket.on('connectionInfo', (info)=>{
            let { address, id } = info
            logger(`Establishing peer connection to node ${address}`);
            
            this.connect(address);
        })

        socket.on('getPeers', ()=>{

        })

        socket.on('error', async(err)=>{
            logger(`Socket Error: ${err}`);
        })
     
        socket.on('disconnect', async()=>{ 
            logger(`Peer ${address} has disconnected from this node`)
            delete this.inbound[address];
        })

    }

    outboundChannels(peer, address){
        peer.on('connect', ()=>{
            if(!this.outbound[address]){
                this.outbound[address] = peer;
                logger(`Peer connection established with node ${address}`)
                let info = {
                    address:this.address,
                    id:this.id
                }
                peer.emit('connectionInfo', info)
            }
        })

        peer.on('message', (message)=>{
            logger(`Node: ${message}`)
        })

        peer.on('peers', ()=>{

        })

        peer.on('error', async(err)=>{
            logger(`Socket Error: ${err}`);
        })

        peer.on('disconnect', ()=>{
            logger(`Connection to node ${address} dropped`)
            delete this.outbound[address]
        })

    }

}

module.exports = P2P;

let myFirstRPC = new P2P({
    host:'0.0.0.0',
    port:'1100'
})
myFirstRPC.start((socket)=>{})


let mySecondRPC = new P2P({
    host:'0.0.0.0',
    port:'1101'
})
mySecondRPC.start((socket)=>{})

myFirstRPC.connect(mySecondRPC.address, (peer)=>{})