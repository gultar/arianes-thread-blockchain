const express = require('express')
const SocketServer = require('socket.io')
const { logger, writeToFile, readFile } = require('../../../tools/utils')
const { RateLimiterMemory } = require('rate-limiter-flexible');
const sha1 = require('sha1')
const fs = require('fs')
const Peer = require('../peers/peer')
const EventEmitter = require('events')
class CoreServer extends EventEmitter{
    constructor(config){
        super()
        let { host, port, httpsEnabled, bootstrapNodes, ...opts  } = config;
        this.config = config
        this.address = '';
        this.id = sha1(sha1(this.address))
        this.httpServer = {} // require('http').createServer()
        this.host = host || 'localhost';
        this.port = port || 8000;
        this.httpsEnabled = (httpsEnabled === undefined ? true : httpsEnabled)
        this.ioServer = {} //
        this.rateLimiter = {}
        this.peersConnected = {};
        this.connectionsToPeers = {};
        this.knownPeers = []
        this.bootstrapNodes = ( bootstrapNodes && Array.isArray(bootstrapNodes) ? bootstrapNodes : []);
        this.messagePool = {}
        this.routineDelay = 30 * 1000
        //Methods & functions
        this.housekeeping = opts.housekeeping || function(){}
        this.peerMessageProtocol = opts.peerMessageProtocol || function(){}
    }

    build(config=this.config){
        return new Promise(async (resolve)=>{
            if(this.httpsEnabled){
                let httpsConfigs = await this.getCertificateAndPrivateKey()
                if(httpsConfigs.error) throw new Error('Could not low HTTPS certificates')
                this.httpServer = require('https').createServer(httpsConfigs)
                this.address = `https://${this.host}:${this.port}`
            }else{
                this.httpServer = require('http').createServer()
                this.address = `http://${this.host}:${this.port}`
            }

            this.rateLimiter = new RateLimiterMemory(
                {
                  points: 100, // 100 points
                  duration: 1, // per second
                }
            );
            this.ioServer = SocketServer(this.httpServer);
            resolve(this.ioServer)
        })
    }

    start(extend=function(){}){
        return new Promise((resolve, reject)=>{
            this.build(this.config)
            .then( built =>{
               
                logger('Core server running on '+this.address)
                this.httpServer.listen(this.port)

                this.ioServer.on('connection', (socket)=>{
                    this.inboundChannels(socket)
                    extend(socket)
                })
        
                this.ioServer.on('disconnect', ()=>{ })
            
                this.ioServer.on('error', (err) =>{ console.log(chalk.red(err))  })
                
                
                resolve(true)
            })
            .catch( e => {
                reject(e)
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

        inboundChannels(socket, extend){
            try{
                let token = JSON.parse(socket.handshake.query.token)
                let address = token.address;
                
                if(!this.peersConnected[address]){
                    this.peersConnected[address] = socket;
                    socket.on('message', (message)=>{
                        logger(`Peer: ${message}`)
                    })
                    
                    socket.on('connectionInfo', async(info)=>{
                        let { address, publicKey } = info
                        logger(`Establishing peer connection to node ${address}`);
                        
                        this.connectToPeer(address)
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
                    
                    if(extend) extend(socket)
                    
                }else{
                    //Cannot recreate same connection
                }
            }catch(e){
                console.log(e)
            }
        }

        async connectToPeer(address){
            if(!this.connectionsToPeers[address]){
                let inactivePeer = new Peer({
                    peerAddress:address
                })
    
                let peer = await inactivePeer.connect({
                    token:JSON.stringify({ 'address':this.address, 'publicKey':this.publicKey})
                })
                
                if(peer.error) throw new Error(peer.error)
                else{
                    this.onPeerConnect(peer, address)
                    this.onPeerDisconnect(peer, address)

                    return peer
                }
            }
        }

        broadcast(eventType, data, retries = false){
            try{
                if(this.connectionsToPeers){
                    Object.keys(this.connectionsToPeers).forEach((peerAddress)=>{
                        
                        this.connectionsToPeers[peerAddress].emit(eventType, data, (acknowledged)=>{
                            if(acknowledged){
                                //If peer is malicious, could implement a way to reduce their reputation score
                                //and close connection if the score is too low
                            }else if(eventType == 'peerMessage' && !acknowledge){
                                logger(`WARNING: Peer ${peerAddress} did not acknowledge peerMessage`)
                                if(retries == 5){
                                    setTimeout(()=> {
                                        //Possibly dangerous
                                        logger(`WARNING: Retrying to send peerMessage`)
                                        let peer = this.connectionsToPeers[peerAddress]
                                        peer.emit(eventType, data)
    
                                    }, 5000)
                                }
                            }
                        });
                    })
                  }else{
                      console.log('No connections')
                  }
              }catch(e){
                console.log(e);
              }
        }

        onPeerConnect(peer, address){
            peer.on('connect', ()=>{
                if(!this.connectionsToPeers[address]){
                    this.connectionsToPeers[address] = peer;
                    logger(`Peer connection established with node ${address}`)
                    let info = {
                        address:this.address,
                        publicKey:this.publicKey
                    }
                    peer.emit('connectionInfo', info)
                }
            })
        }

        onPeerDisconnect(peer){
            peer.on('disconnect', ()=>{
                logger(`Connection to node ${address} dropped`)
                delete this.connectionsToPeers[address]
            })
        }

    /**
        @desc Periodically clears out peer messages to avoid overflow
    */
    cleanMessageBuffer(){
        var that = this;
        setInterval(()=>{
            that.messagePool = {};
            that.housekeeping()
        }, this.routineDelay)
    }

}

module.exports = CoreServer

