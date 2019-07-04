
const SocketServer = require('socket.io')
const PeerConnection = require('socket.io-client')
const { logger, writeToFile, readFile } = require('../../tools/utils')
const { RateLimiterMemory } = require('rate-limiter-flexible');
const sha1 = require('sha1')
const fs = require('fs')

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
        this.knownPeers = []
        this.bootstrapNodes = [];
        this.messagePool = {}
        this.routineDelay = 30 * 1000
    }

    start(){
        return new Promise((resolve)=>{
            logger(`RPC Interface listening on ${this.address}`)
            this.httpServer.listen(this.port)
            
            this.ioServer.on('connection', (socket)=>{
                let address = socket.request.connection.remoteAddress;
                if(!this.inbound[address]){
                    this.inbound[address] = socket;
                    this.inboundChannels(socket, address)
                    resolve(socket)
                }else{
                    socket.destroy()
                }
                
                
            })
        })
        

    }


    connect(peerAddress){
        return new Promise((resolve)=>{
            if(!this.outbound[peerAddress]){
                let connectionAttempts = 0;
                let config = {
                    'transport': ['websocket'],
                    'reconnection limit' : 1000,
                    'max reconnection attempts' : 3,
                    'pingInterval': 2000, 
                    'pingTimeout': 10000,
                    'query':
                    {
                      token: JSON.stringify({ 'address':this.address, 'publicKey':this.publicKey}),
                    }
                  }
                let peer = PeerConnection(peerAddress, config)
                peer.on('connect_timeout', (timeout)=>{
                    if(connectionAttempts >= 3) {
                        peer.destroy()
                        resolve(false)
                    }else{
                        logger('Attempting to reconnect to', peerAddress)
                        connectionAttempts++;
                    }
                })
                if(peer){
                    this.outboundChannels(peer, peerAddress)
                    resolve(peer)
                }
            }
        })
        
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
            socket.emit('peers', this.knownPeers)
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

        peer.on('peers', (knownPeers)=>{

        })

        peer.on('error', async(err)=>{
            logger(`Socket Error: ${err}`);
        })

        peer.on('disconnect', ()=>{
            logger(`Connection to node ${address} dropped`)
            delete this.outbound[address]
        })

    }

    /**
        @desc Periodically clears out peer messages to avoid overflow
    */
    cleanMessageBuffer(){
        var that = this;
        setInterval(()=>{
            that.messagePool = {};
        }, this.routineDelay)
    }

}

module.exports = P2P;

let myFirstRPC = new P2P({
    host:'0.0.0.0',
    port:'1100'
})

myFirstRPC.start().then((socket)=>{
    socket.on('poubelle', (msg) => console.log(msg))
})

let mySecondRPC = new P2P({
    host:'0.0.0.0',
    port:'1101'
})

mySecondRPC.start().then((socket)=>{
    socket.on('poubelle', (msg) => console.log(msg))
    
})

myFirstRPC.connect(mySecondRPC.address, (peer)=>{})

// const fs = require('fs');
// const server = require('https').createServer({
//   key: fs.readFileSync('./certificates/priv.pem'),
//   cert: fs.readFileSync('./certificates/cert.pem')
// });
// const io = SocketServer(server);

// io.on('connection', (socket)=>{
//     console.log('Connected')
//     socket.emit('message', 'les raviolis étaient fantastiques')
// })

// // client-side
// const socket = PeerConnection('https://localhost:3000',{
//   // option 1
//   ca: fs.readFileSync('./certificates/cert.pem'),

//   // option 2. WARNING: it leaves you vulnerable to MITM attacks!
//   rejectUnauthorized: false
// });

// socket.on('connect', ()=>{
//     console.log('Worked')
// })

// socket.on('message', (msg) => console.log(msg))
// console.log('Listening on 3000')
// server.listen(3000);