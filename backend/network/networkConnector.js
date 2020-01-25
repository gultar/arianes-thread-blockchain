const express = require('express')
const SocketServer = require('socket.io')
const PeerConnection = require('socket.io-client')
const { logger, writeToFile, readFile } = require('../tools/utils')
const { RateLimiterMemory } = require('rate-limiter-flexible');
const sha1 = require('sha1')
const fs = require('fs')

class NetworkConnector{
    constructor(config){
        
        let { host, port, bootstrapNodes, ...opts  } = config;
        this.config = config
        this.address = '';
        this.id = sha1(sha1(this.address))
        this.httpServer = {} // require('http').createServer()
        this.host = host;
        this.port = port;
        this.ioServer = {} //
        this.peersConnected = {};
        this.connectionToPeers = {};
        this.knownPeers = []
        this.bootstrapNodes = ( bootstrapNodes && Array.isArray(bootstrapNodes) ? bootstrapNodes : []);
        this.messagePool = {}
        this.routineDelay = 30 * 1000
        
    }

    build(config){
        return new Promise(async (resolve)=>{
            if(config.httpsEnabled){
                let httpsConfigs = await this.getCertificateAndPrivateKey()
                if(httpsConfigs.error) throw new Error('Could not low HTTPS certificates')
                this.httpServer = require('https').createServer(httpsConfigs)
                this.address = `https://${config.host}:${config.port}`
            }else{
                this.httpServer = require('http').createServer()
                this.address = `http://${config.host}:${config.port}`
            }
            this.ioServer = SocketServer(this.httpServer, { transport:['websocket'] });
            resolve(true)
        })
    }

    start(extend){
        return new Promise((resolve)=>{
            this.build(this.config)
            .then( built =>{
                logger(`RPC Interface listening on ${this.address}`)
                this.httpServer.listen(this.port)
                
                this.inboundChannels(extend)
                resolve(true)
            })
            .catch( e => {
                console.log('NETWORK ERROR',e)
            })
            
        })
    }

        getCertificateAndPrivateKey(){
            return new Promise(async (resolve)=>{
            
                fs.exists('./certificates/cert.pem', async (certExists)=>{
                    if(!certExists) {
                    let options = await this.createSSL();
                    if(options){
                        logger('Loaded SSL certificate and private key')
                        resolve(options)
                    }else{
                        logger('ERROR: Could not generate certificate or private key')
                        resolve(false)
                    }
                    }else{
                    let certificate = await readFile('./certificates/cert.pem');
                    if(certificate){
                        let privateKey = await this.getSSLPrivateKey();
                        if(privateKey){
                        let options = {
                            key:privateKey,
                            cert:certificate
                        }
                        logger('Loaded SSL certificate and private key')
                        resolve(options)
                        }else{
                        logger('ERROR: Could not load SSL private key')
                        resolve(false)
                        }
                        
                    }else{
                        logger('ERROR: Could not load SSL certificate')
                        resolve(false)
                    }
            
                    }
                    
                    
                })
            })
        }

        getSSLPrivateKey(){
            return new Promise(async(resolve)=>{
                fs.exists('./certificates/priv.pem', async(privExists)=>{
                    if(!privExists) resolve(false)
                    let key = await readFile('./certificates/priv.pem')
                    if(key){
                    resolve(key)
                    }else{
                    logger('ERROR: Could not load SSL private key')
                    resolve(false)
                    }
                })
            })
        }

        createSSL(){
            return new Promise(async (resolve)=>{
                let generate = require('self-signed')
                var pems = generate(null, {
                    keySize: 1024, // defaults to 1024
                    serial: '329485', // defaults to '01'
                    expire: new Date('10 December 2100'), // defaults to one year from today
                    pkcs7: false, // defaults to false, indicates whether to protect with PKCS#7
                    alt: [] // default undefined, alternate names if array of objects/strings
                });
                logger('Created SSL certificate')
                let certWritten = await writeToFile(pems.cert, './certificates/cert.pem')
                let privKeyWritten = await writeToFile( pems.private, './certificates/priv.pem');
                let pubKeyWritten = await writeToFile(pems.public, './certificates/pub.pem');
            
                if(certWritten && privKeyWritten && pubKeyWritten){
                    let options = {
                    cert:pems.cert,
                    key:pems.private
                    }
                    resolve(options)
                }else{
                    resolve(false)
                }
            })
        }


    establishPeerConnection(peerAddress){
        return new Promise((resolve)=>{
            if(!this.connectionToPeers[peerAddress]){
                let connectionAttempts = 0;
                logger('Attempting to connect to ', peerAddress)
                
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

                if(peerAddress.includes('https')){
                    config.rejectUnauthorized = false;
                    config.secure = true;
                }

                let peer = PeerConnection(peerAddress, config)
                peer.on('connect_timeout', (timeout)=>{
                    logger('Connection timedout')
                    if(connectionAttempts >= 3) {
                        peer.destroy()
                        resolve(false)
                    }else{
                        logger('Attempting to reconnect to', peerAddress)
                        connectionAttempts++;
                    }
                })
                if(peer){
                    resolve(peer)
                }else{
                    resolve(false)
                }
            }else{
                resolve(this.connectionToPeers[peerAddress])
            }
        })
        
    }

    connect(peerAddress, extendListeners){
        return new Promise(async (resolve)=>{
            let peer = await this.establishPeerConnection(peerAddress)
            if(peer){
                this.outboundChannels(peer, peerAddress, extendListeners)
                
                resolve(peer)
            }else{
                logger('Could not connect to peer', peerAddress)
                resolve(false)
            }
        })
    }

    inboundChannels(extend){
        
        this.ioServer.on('connection', (socket)=>{
            let address = socket.request.connection.remoteAddress;
            if(!this.peersConnected[address]){
                this.peersConnected[address] = socket;
                socket.on('message', (message)=>{
                    logger(`Peer: ${message}`)
                })
                if(extend) extend(socket)
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
                    delete this.peersConnected[address];
                })
                
                
            }else{
                socket.destroy()
            }
            
        })

        this.ioServer.on('disconnect', ()=>{ })
    
        this.ioServer.on('error', (err) =>{ logger(chalk.red(err));  })

    }

    outboundChannels(peer, address, extendListeners){

        peer.on('connect', ()=>{
            if(!this.connectionToPeers[address]){
                this.connectionToPeers[address] = peer;
                logger(`Peer connection established with node ${address}`)
                let info = {
                    address:this.address,
                    id:this.id
                }
                peer.emit('connectionInfo', info)
            }
        })

        if(extendListeners) extendListeners(peer)

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
            delete this.connectionToPeers[address]
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

module.exports = NetworkConnector;

const testNetworkConnector = async () =>{
    let myFirstRPC = new NetworkConnector({
        host:'0.0.0.0',
        port:'1100',
        httpsEnabled:true
    })
    let mySecondRPC = new NetworkConnector({
        host:'0.0.0.0',
        port:'1101',
        httpsEnabled:true
    })
    
    function extend(socket){
        // console.log(socket)
        socket.on('muppet', (msg)=>{
            
            console.log('Poubelle', msg)
        })
        // console.log(socket.listeners('muppet')[0]())
    }

    myFirstRPC.start(extend)
    .then((socket)=>{
        
    })
    mySecondRPC.start()
    .then((socket)=>{
        myFirstRPC.connect(mySecondRPC.address )
        .then((peer)=>{
            // console.log(peer)
            setTimeout(()=>{
                peer.emit('muppet', 'POUBA')
            }, 3000)
        })
        
    })
    
    

    
    
    // setTimeout(()=>{
        
    // }, 200)
}

testNetworkConnector()



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
// //   ca: fs.readFileSync('./certificates/cert.pem'),
//     secure:true,
//   // option 2. WARNING: it leaves you vulnerable to MITM attacks!
//   rejectUnauthorized: false
// });

// socket.on('connect', ()=>{
//     console.log('Worked')
// })



// socket.on('message', (msg) => console.log(msg))
// console.log('Listening on 3000')
// server.listen(3000);