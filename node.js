/**
 TFLB | Thousandfold Blockchain
 @author: Sacha-Olivier Dulac
*/

'use strict'
/********HTTP Server and protection************/
const express = require('express');
const http = require('http');
const https = require('https')
const bodyParser = require('body-parser');
const RateLimit = require('express-rate-limit');
const helmet = require('helmet');

//*********** Websocket connection**************/
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
//************Blockchain classes****************/
const Blockchain = require('./backend/classes/chain');
const Block = require('./backend/classes/block')
const NodeList = require('./backend/classes/nodelist');
const WalletManager = require('./backend/classes/walletManager');
const AccountCreator = require('./backend/classes/accountCreator');
const PeerDiscovery = require('./backend/network/peerDiscovery');
const SSLHandler = require('./backend/network/sslHandler')
/**************Live instances******************/
const Mempool = require('./backend/classes/pool'); //Instance not class


/****************Tools*************************/
const { 
  displayTime, 
  displayDate, 
  logger, 
  writeToFile, 
  readFile, 
  isHashPartOfMerkleTree, 
  createDirectoryIfNotExisting } = require('./backend/tools/utils');

const {
  isValidTransactionJSON,
  isValidTransactionCallJSON,
  isValidCallPayloadJSON,
  isValidWalletBalanceJSON,
  isValidActionJSON,
  isValidBlockJSON
} = require('./backend/tools/jsonvalidator');
const sha256 = require('./backend/tools/sha256');
const sha1 = require('sha1')
const chalk = require('chalk');
const { RateLimiterMemory } = require('rate-limiter-flexible');


/**
  Instanciates a blockchain node
  @constructor
  @param {object} $options - Options to configure node and all of its constituent parts
*/

class Node {
  constructor(options){
    //Basic node configs
    this.host = options.host || 'localhost',
    this.port = options.port || '8000'
    this.httpsEnabled = options.httpsEnabled
    this.httpPrefix = (this.httpsEnabled ? 'https' : 'http')
    this.address = `${this.httpPrefix}://${this.host}:${this.port}`;
    this.minerPort = options.minerPort || parseInt(this.port) + 2000
    this.id = options.id || sha1(Math.random() * Date.now());
    this.publicKey = options.publicKey;
    this.verbose = options.verbose;
    this.enableLocalPeerDiscovery = options.enableLocalPeerDiscovery;
    this.enableDHTDiscovery = options.enableDHTDiscovery;
    this.peerDiscoveryPort = options.peerDiscoveryPort || '6000';
    this.dhtLookupTime = options.dhtLookupTime || 5 * 60 * 1000;
    this.noLocalhost = options.noLocalhost || false;
    //Genesis Configs
    this.genesis = options.genesis
    //Parts of Node
    this.mempool = new Mempool()
    this.nodeList = new NodeList();
    this.walletManager = new WalletManager();
    this.accountCreator = new AccountCreator();
    this.ssl = new SSLHandler()
    this.chain = new Blockchain([], this.mempool);
    //Network related parameters
    this.ioServer = {};
    this.userInterfaces = [];
    this.peersConnected = {}; //From ioServer to ioClient
    this.connectionsToPeers = {}; //From ioClient to ioServer
    this.peersLatestBlocks = {}
    this.messageBuffer = {};
    this.messageBufferCleanUpDelay = 30 * 1000;
    this.blocksToValidate = []
    this.updated = false;
    this.isDownloading = false;
    this.minerStarted = false;
  }


  /**
    Boots up Node's Websocket Server and local HTTP and Wesocket APIs
  */
  startServer(){

    return new Promise(async (resolve, reject)=>{
      
      console.log(chalk.cyan('\n******************************************'))
      console.log(chalk.cyan('*')+' Starting node at '+this.address);
      console.log(chalk.cyan('******************************************\n'))

        this.chain.init()
        .then(async (chainLoaded)=>{
            
            
            process.GENESIS = this.genesis
            
            let nodeListLoaded = await this.nodeList.loadNodeList();
            let mempoolLoaded = await this.mempool.loadMempool();
            
            
            if(!nodeListLoaded) reject('Could not load node list')
            if(!mempoolLoaded) reject('Could not load mempool');
            //if(!accountsLoaded) reject('Could not load account table')

            logger('Loaded Blockchain'); 
            logger('Loaded peer node list');
            logger('Loaded transaction mempool');
            logger('Number of transactions in pool: '+this.mempool.sizeOfPool());
            logger('Number of actions in pool: '+this.mempool.sizeOfActionPool());

            if(this.httpsEnabled){
              let sslConfig = await this.ssl.getCertificateAndPrivateKey()
              this.server = https.createServer(sslConfig);
            }else{
              this.server = http.createServer();
            }
            
            this.server.listen(this.port);
            process.env.PORT = this.port;
            let savedPort = await this.savePortConfig();
            if(savedPort) logger('Saved port to .env config file')
            else logger('WARNING: Could not save port to .env file')
            this.heartbeat();
            this.localAPI();
            
            if(this.enableLocalPeerDiscovery){
              this.findPeersThroughDNSSD()
            }

            if(this.enableDHTDiscovery){
              this.findPeersThroughBittorrentDHT()
            }
            
            this.ioServer = socketIo(this.server, { 'pingInterval': 200, 'pingTimeout': 10000, 'forceNew':true });
      
            this.ioServer.on('connection', (socket) => {
              
              let token = socket.handshake.query.token;
              
              if(socket){
                
                    socket.on('message', (msg) => { logger('Client:', msg); });

                    if(token && token != undefined){
                      token = JSON.parse(token)
                      let peerAddress = token.address
                      
                      if(socket.request.headers['user-agent'] === 'node-XMLHttpRequest'){  //
                        if(!this.peersConnected[socket.handshake.headers.host]){

                          this.peersConnected[peerAddress] = socket;
                          this.nodeList.addNewAddress(peerAddress);
                          this.nodeEventHandlers(socket, peerAddress);

                        }else{
                          //  logger('Peer is already connected to node')
                        }
                      }else{
                        socket.emit('message', 'Connected to local node');
                        this.externalEventHandlers(socket);
                      } 
                    }else{
                      socket.emit('message', 'Connected to local node');
                      this.externalEventHandlers(socket);
                    }
                    
                
                
              }else{
                logger(chalk.red('ERROR: Could not create socket'))
              }
        
            });
        
            this.ioServer.on('disconnect', ()=>{ })
        
            this.ioServer.on('error', (err) =>{ logger(chalk.red(err));  })
        
            resolve(true)
        })
        .catch(e =>{
          console.log(e)
          throw new Error(e)
        })

        
    })
  }

  /**
    Socket listeners only usable by server nodes
    @param {object} $socket - Client socket connection to this node's server
  */
  nodeEventHandlers(socket, peerAddress){
    if(socket && peerAddress){
      const rateLimiter = new RateLimiterMemory(
        {
          points: 100, // 5 points
          duration: 1, // per second
        });

    socket.on('error', async(err)=>{
      logger('Socket error:',err);
    })

    socket.on('disconnect', async()=>{ 
      logger(`Peer ${peerAddress} has disconnected from node`);
      delete this.peersConnected[peerAddress];
    })

    socket.on('connectionRequest', async(address)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => {  console.log("Peer sent too many 'connectionRequest' events") }); // consume 1 point per event from IP
      this.connectToPeer(address);
    });

    socket.on('peerMessage', async(peerMessage, acknowledge)=>{
      if(!this.messageBuffer[peerMessage.messageId]){
        await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'peerMessage' events") }); // consume 1 point per event from IP
        
        this.handlePeerMessage(peerMessage, acknowledge);
      }
    })

    socket.on('getPeers', async()=>{
        await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getPeer' events") }); // consume 1 point per event from IP
        let peers = this.nodeList.addresses;
        let randomPeers = []
        peers.forEach( peer=>{
          let selected = (Math.random() *10) % 2 > 0; 
          //Selected or not
          if(selected){
            randomPeers.push(peer);
          }
        })
        socket.emit('newPeers', randomPeers);
    })

    
    socket.on('getBlockchainStatus', async(peerStatus)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockchainStatus' events") }); // consume 1 point per event from IP
      if(this.chain instanceof Blockchain){
        try{
          let status = {
            totalDifficultyHex: this.chain.getTotalDifficulty(),
            bestBlockHeader: this.chain.getLatestBlock(),
            length: this.chain.chain.length
          }

          socket.emit('blockchainStatus', status);
          let peer = this.connectionsToPeers[peerAddress];
          if(peer){
            let updated = await this.receiveBlockchainStatus(peer, peerStatus)
            
            if(updated){
              if(updated.error) socket.emit('blockchainStatus', false)
              
            }
          }else{
            this.connectToPeer(peerAddress)
            logger('ERROR: Could not find peer socket to download blockchain')
          }
          
        }catch(e){
          console.log(e)
        }
      }
        
    })

    socket.on('getInfo', async()=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getInfo' events") }); // consume 1 point per event from IP
      if(this.chain instanceof Blockchain){

        try{

          let info = this.getChainInfo();
          socket.emit('chainInfo', info);
        }catch(e){
          console.log(e)
        }
      }
    })

    socket.on('getBlockHeader', async (blockNumber)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockHeader' events") });
      if(blockNumber && typeof blockNumber == 'number'){
        let header = await this.chain.getBlockHeader(blockNumber);
        if(header){
          socket.emit('blockHeader', header)
        }else if(blockNumber == this.chain.getLatestBlock().blockNumber + 1){
          socket.emit('blockHeader', {end:'End of header chain'})
        }else{
          socket.emit('blockHeader', {error:'Header not found'})
        }
      }
    })

    socket.on('getBlock', async (blockNumber)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockHeader' events") });
      if(blockNumber && typeof blockNumber == 'number'){
        let block = await this.chain.getBlockFromDB(blockNumber);
        if(block){
          socket.emit('block', block)
        }else if(blockNumber == this.chain.getLatestBlock().blockNumber + 1){
          socket.emit('block', {end:'End of block chain'})
        }else{
          socket.emit('block', {error:'Block not found'})
        }
      }
    })

    socket.on('getGenesisBlock', async ()=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { 
        // console.log("Peer sent too many 'getNextBlock' events") 
      }); // consume 1 point per event from IP
      let genesisBlock = this.chain.getGenesisBlockFromDB()
      socket.emit('genesisBlock', genesisBlock)
    })

    socket.on('getPreviousBlock', async (hash)=>{
      if(hash){
        await rateLimiter.consume(socket.handshake.address).catch(e => { 
          // console.log("Peer sent too many 'getNextBlock' events") 
        }); // consume 1 point per event from IP
        let index = this.chain.getIndexOfBlockHash(hash)
        
        if(index && index > 0){
          if(hash == this.chain.chain[0].hash){
            socket.emit('previousBlock', {end:'Reached genesis block'})
          }else{
            let block = await this.chain.getBlockFromDB(index - 1)
            if(block){
              if(block.error) socket.emit('previousBlock', {error:block.error})
              socket.emit('previousBlock', block)
            }else{
              socket.emit('previousBlock', {error:`ERROR: Could not find block body of ${previousBlock.hash} at block index ${previousBlock.blockNumber}`})
            }
            
          }
          
        }else{
          socket.emit('previousBlock', {error:'Block not found'})
        }
      }
      
    })

    socket.on('getNextBlock', async (hash)=>{
      if(hash){
        await rateLimiter.consume(socket.handshake.address).catch(e => { 
          // console.log("Peer sent too many 'getNextBlock' events") 
        }); // consume 1 point per event from IP

        let index = this.chain.getIndexOfBlockHash(hash)
        let isGenesis = this.chain.chain[0].hash == hash
        
        if(index || isGenesis){
          if(hash == this.chain.getLatestBlock().hash){
            socket.emit('nextBlock', {end:'End of blockchain'})
          }else{
            
            let nextBlock = this.chain.chain[index + 1]
            if(nextBlock){
              let block = await this.chain.getBlockFromDB(nextBlock.blockNumber)
              if(block){
                if(block.error) socket.emit('nextBlock', {error:block.error})
                socket.emit('nextBlock', block)
              }else{
                socket.emit('nextBlock', {error:`ERROR: Could not find block body of ${nextBlock.hash} at block index ${nextBlock.blockNumber}`})
              }
              
                
            }else{
              console.log('Chain does not contain block at ', index+1)
            }

            
          }
          
        }else{
          socket.emit('nextBlock', {error:'Block not found'})
        }
      }
      
    })

    socket.on('getBlockFromHash', async(hash)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockFromHash' events") }); // consume 1 point per event from IP
      if(this.chain instanceof Blockchain){
        if(hash && typeof hash == 'string'){
        
          let blockIndex = this.chain.getIndexOfBlockHash(hash);
          if(blockIndex){
            let block = await this.chain.getBlockFromDB(blockIndex);
            if(block){
              if(block.error) socket.emit('blockFromHash', {error:block.error})
              else socket.emit('blockFromHash', block)
              
            }else if(blockIndex == this.chain.getLatestBlock().blockNumber + 1){
              socket.emit('blockFromHash', {end:'End of blockchain'})
            }else{
              if(this.chain.getLatestBlock().blockFork && this.chain.getLatestBlock().blockFork[hash]){
                let block = this.chain.getLatestBlock().blockFork[hash];
                socket.emit('blockFromHash', {fork:block})
              }else{
                socket.emit('blockFromHash', {error:'Block not found'})
              }
              
            }
          }else{
            socket.emit('blockFromHash', {error:'Block not found'})
          }
          
        }
      }
    })

    

    }
  }

  
  joinPeers(){
    try{
      if(this.nodeList.addresses){
        this.nodeList.addresses.forEach((peer)=>{
          this.connectToPeer(peer);
        })
      }
    }catch(e){
      console.log(chalk.red(e))
    }

  }

  findPeers(){
    logger('Finding new peers...')
    let peerAddresses = Object.keys(this.connectionsToPeers);
    let peerNumber = peerAddresses.length;
    if(peerNumber > 0){
      let randomPeerIndex = Math.floor(Math.random() * peerNumber)
      let randomPeerAddress = peerAddresses[randomPeerIndex]
      
      let randomPeer = this.connectionsToPeers[randomPeerAddress];
      if(randomPeer){
        logger('Requesting new peer addresses from', randomPeerAddress)
        randomPeer.emit('getPeers');
        setTimeout(()=>{
          this.joinPeers()
        }, 2000)
      }
    }else{
      //Reconnect to other node addresses stored in nodeList
    }
  }

  findPeersThroughDNSSD(){
    this.peerDiscovery = new PeerDiscovery({
      address:this.address,
      host:this.host,
      port:this.peerDiscoveryPort,
    });

    
    this.peerDiscovery.find()
    .then(()=>{
      this.peerDiscovery.collectPeers((emitter)=>{
        emitter.on('peerDiscovered', (peer)=> {
          let { host, port, address } = peer
          logger('Found new peer', chalk.green(address))
          this.connectToPeer(address)
        })
      })
      
    })
  }

  findPeersThroughBittorrentDHT(){
    const extractBaseIpAddress = (address) =>{
      let ip = ''
      if(address){
        let containsHttp = address.indexOf('http://') != -1;
        let containsHttps = address.indexOf('https://') != -1;
        let prefix = (containsHttp ? 'http://':'https://')
        let result = address.split(prefix);
        let addressAndPort = result[1];
        let splitIpAndPort = addressAndPort.split(':')
        ip = splitIpAndPort[0];
        return ip
      }else{
        return false;
      }
    }
    if(!this.peerDiscovery){
      this.peerDiscovery = new PeerDiscovery({
        address:this.address,
        host:this.host,
        port:this.peerDiscoveryPort,
        channel:this.networkChannel
      });
      
      this.peerDiscovery.searchDHT()
      .then(()=>{
        this.peerDiscovery.collectPeers((emitter)=>{
          //DHT Lookup timeout, so we don't keep looking forever
          // setTimeout(()=>{
          //   this.peerDiscovery.close()
          //   this.peerDiscovery = undefined;
          // }, this.dhtLookupTime )
  
          emitter.on('peerDiscovered', (peer)=> {
            let isSameIp = extractBaseIpAddress(peer.address) == extractBaseIpAddress(this.address)
            if(!this.connectionsToPeers[peer.address] && !isSameIp){
              let { host, port, address } = peer
              logger('Found new peer', chalk.green(address))
              this.connectToPeer(address)
            }
          })

          emitter.on('peerInactive', (peer)=>{
            //Ping peer
          })
        })
      })
    }
    
  }

  getNumberOfConnectionsToPeers(){
    let connections = Object.keys(this.connectionsToPeers);
    return connections.length
  }

  seekOtherPeers(){
    let activePeersAddresses = this.getNumberOfConnectionsToPeers()
    if(activePeersAddresses.length < this.minimumNumberOfPeers){
      this.findPeers()
    }
  }


  /**
    Basis for P2P connection
  */
  connectToPeer(address, callback){
    
    if(address && this.address != address){
      if(!this.connectionsToPeers[address]){
        
        let connectionAttempts = 0;
        let peer;
        try{
          
          let config = {
            'reconnection limit' : 1000,
            'max reconnection attempts' : 3,
            'pingInterval': 200, 
            'pingTimeout': 10000,
            'secure':true,
            'rejectUnauthorized':false,
            'query':
            {
              token: JSON.stringify({ 'address':this.address }),
            }
          }

          if(this.noLocalhost && (address.includes('localhost') || address.includes('127.0.0.1') || address.includes('0.0.0.0'))){
            logger('Connections to localhost not allowed')
            return null;
          }
          
          peer = ioClient(address, config);
          peer.heartbeatTimeout = 120000;

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


          peer.on('connect', () =>{
            if(!this.connectionsToPeers[address]){

              this.connectionsToPeers[address] = peer;
              logger(chalk.green('Connected to ', address))
              this.UILog('Connected to ', address+' at : '+ displayTime())
              peer.emit('message', 'Connection established by '+ this.address);
              let status = {
                totalDifficultyHex: this.chain.getTotalDifficulty(),
                bestBlockHeader: this.chain.getLatestBlock(),
                length: this.chain.chain.length
              }
              peer.emit('connectionRequest', this.address);
              this.nodeList.addNewAddress(address)  

              setTimeout(()=>{
                peer.emit('getBlockchainStatus', status);
                peer.emit('getPeers')
              },5000);
              
              
            }else{}
          })

          peer.on('newPeers', (peers)=> {
            if(peers && typeof peers == Array){
              peers.forEach(addr =>{
                //Validate if ip address
                logger('Peer sent a list of potential peers')
                if(!this.nodeList.addresses.includes(addr) && !this.nodeList.blackListed.includes(addr)){
                  this.nodeList.addNewAddress(addr)
                }
              })
            }
          })

          peer.on('blockchainStatus', async (status)=>{
            // logger(`Received blockchain status from peer ${address}`);
            if(!this.isDownloading){
              let updated = await this.receiveBlockchainStatus(peer, status)
              this.isDownloading = false
            }
          })

          peer.on('disconnect', () =>{
            logger(`connection with peer ${address} dropped`);
            delete this.connectionsToPeers[address];
            this.connectToPeer(address)
            peer.destroy()
          })

          if(callback){
            callback(peer)
          }



        }catch(err){
          console.log(err)
        }

      }else{
        // logger('Already initiated peer connection')
      }

    }
  }


  downloadBlockFromHash(peer, hash){
    return new Promise(async (resolve)=>{
      if(peer && hash){
        
        peer.emit('getBlockFromHash', hash);

        peer.on('blockFromHash', (block)=>{
          
          if(block){
            if(block.fork){
              peer.off('blockFromHash');
              resolve(block.fork)
            }else{

              if(block.error){
                logger('BLOCK DOWNLOAD ERROR:',block.error)
                peer.off('blockFromHash');
                resolve({error:block.error})
              }
  
              peer.off('blockFromHash');
              resolve(block)
            }
            
          }else{
            logger('ERROR: No block received')
          }
        })
      }
    })
  }

  requestChainInfo(peer){
    return new Promise( async(resolve)=>{
      if(peer){
        if(this.chain instanceof Blockchain){
          peer.emit('getInfo');
  
          peer.on('chainInfo', (info)=>{
            if(info){
              peer.off('chainInfo')
              resolve(info)
            }else{
              peer.off('chainInfo')
              resolve({error:'ERROR: Could not fetch chain info'})
            }
          })
        }
      }
    })
    
  }

  downloadGenesisBlock(peer){
    return new Promise((resolve)=>{
      this.isDownloading = true;
      logger("Downloading peer's genesis block")
      peer.on('genesisBlock', (genesisBlock)=>{
        peer.off('genesisBlock')
        this.isDownloading = false;
        clearTimeout(timeout)
        if(genesisBlock.error){
          logger(genesisBlock.error)
          resolve({error:genesisBlock.error})
        }else{
          resolve(genesisBlock)
        }
      })

      peer.emit('getGenesisBlock')

      let timeout = setTimeout(()=>{
        logger('Genesis block request timedout')
        peer.off('genesisBlock')
        this.isDownloading = false;
      }, 5000)
    })
  }

  downloadBlockchain(peer, lastHeader){
    return new Promise(async (resolve)=>{
      let startHash = this.chain.getLatestBlock().hash;
      let lastHash = lastHeader.hash;
      let length = lastHeader.blockNumber + 1;
      this.isDownloading = true;
      let unansweredRequests = 0;
      let maxRetryNumber = 10
      this.retrySending = null;
      
      const awaitRequest = () =>{
        if(unansweredRequests <= maxRetryNumber){
          this.retrySending = setTimeout(()=>{
            
            peer.emit('getNextBlock', this.chain.getLatestBlock().hash)
            unansweredRequests++
            awaitRequest()
          }, 5000)
        }else{
          logger('Blockchain download failed. No answer')
          closeConnection()
        }
      }

      const closeConnection = () =>{
        peer.off('nextBlock')
        this.isDownloading = false;
      }

      peer.on('nextBlock', async (block)=>{
        unansweredRequests = 0
        clearTimeout(this.retrySending)
        if(block.end){
          logger('Blockchain updated successfully!')
          closeConnection()
          resolve(true)
        }else if(block.error){
          logger(block.error)
          closeConnection()
          resolve({ error: block.error })
        }else{
          let isBlockPushed = await this.chain.pushBlock(block);
          if(isBlockPushed.error){
            closeConnection()
            resolve({ error: isBlockPushed.error })
          }else if(isBlockPushed.outOfSync){
            //Do something like a diagnosis to fix out of sync blockchain
            resolve({ error:'Blockchain is out of sync'})
          }else if(isBlockPushed.isBusy){
            peer.emit('getNextBlock', block.hash)
            awaitRequest()
          }else if(isBlockPushed.sync){
            //Try to fix something
            awaitRequest()
          }else{
            
            peer.emit('getNextBlock', block.hash)
            awaitRequest()
          }
          
        }
      })
      
      peer.emit('getNextBlock', startHash);

    })
    
  }

/**
 * 
 * @param {Socket} peer - Outbound peer connection socket
 * @param {Object} status - Blockchain status object indicating latest block received on their part
 * @description - Queries peer for its latest block before attempting to download and validate their blockchain, block by block
 */
  receiveBlockchainStatus(peer, status){
    return new Promise(async (resolve) =>{
      if(this.chain instanceof Blockchain && peer && status){
        if(!this.isDownloading){
          let { totalDifficultyHex, bestBlockHeader, length } = status;
          if(totalDifficultyHex && bestBlockHeader && length){
            this.peersLatestBlocks[peer.io.uri] = bestBlockHeader
            let thisTotalDifficultyHex = await this.chain.getTotalDifficulty();
            // Possible major bug, will not sync if chain is longer but has different block at a given height
            let totalDifficulty = BigInt(parseInt(totalDifficultyHex, 16))
            let thisTotalDifficulty =  BigInt(parseInt(thisTotalDifficultyHex, 16))

            if(thisTotalDifficulty < totalDifficulty){
              logger('Attempting to download blocks from peer')
              
              let isValidHeader = this.chain.validateBlockHeader(bestBlockHeader);
              if(isValidHeader){

                let downloaded = await this.downloadBlockchain(peer, bestBlockHeader)
                if(downloaded.error){
                  logger('Could not download blockchain')
                  console.log(downloaded.error)
                  resolve(false)
                }else{
                  this.updated = true
                  peer.send('getBlockchainStatus')
                  resolve(true)
                }
               
              }else{
                console.log(bestBlockHeader)
                logger('ERROR: Last block header from peer is invalid')
                resolve(false)
              }
            }else{
              // logger('Blockchain is up to date with peer')
              resolve(true)
            }
  
            
  
          }else{
            logger('ERROR: Status object is missing parameters')
            resolve(false)
          }
        }else{
          resolve(true)
        }
      }else{
        resolve(false)
      }
    })
    
  }

  getMostUpToDatePeer(){
    return new Promise(async (resolve)=>{
      if(Object.keys(this.connectionsToPeers).length > 0){
        let heightestTotalDifficulty = '0x001'
        let mostUpdateToDatePeer = null
        for await(let address of Object.keys(this.connectionsToPeers)){
          let peer = this.connectionsToPeers[address]

          let peerLatestBlock = this.peersLatestBlocks[address]
          if(peerLatestBlock){
            let totalDifficulty = BigInt(parseInt(peerLatestBlock.totalDifficulty, 16))
            if(totalDifficulty > BigInt(parseInt(heightestTotalDifficulty, 16))){
              heightestTotalDifficulty = peerLatestBlock.totalDifficulty
              mostUpdateToDatePeer = peer
            }
          }
          
          
        }

        if(mostUpdateToDatePeer){
          resolve(mostUpdateToDatePeer)
        }else{
          resolve(false)
        }
        
      }else{
        resolve(false)
      }
    })
  }

  //Heavy WIP
  fixUnlinkedBranch(unlinkedHash){
    return new Promise(async (resolve)=>{
        //Finding missing blocks from an unlinked branch where block was pushed. 
        //By finding the missing blocks, current branch is to be swapped with it
        // console.log('About to find missing blocks')
        let missingBlocks = await this.getMissingBlocksToSyncBranch(unlinkedHash)
        
        if(missingBlocks.error) resolve({error:missingBlocks.error})
        else if(missingBlocks.isBranch){
          if(!Array.isArray(missingBlocks.isBranch) && typeof missingBlocks.isBranch == 'object'){
            missingBlocks.isBranch = [ missingBlocks.isBranch ]
          }
          
          if(missingBlocks.isBranch.length == 0){
            resolve({error:'ERROR: Peer could not find any of the missing blocks'})
          }else{
             // console.log('Number of branched missing blocks', missingBlocks)
            let firstBlock = missingBlocks.isBranch[0]
            // console.log('First missing block', firstBlock)
            let branch = this.chain.branches[firstBlock.previousHash]
            // console.log('Linked chain length', branch.length)
            let unlinkedBranch = this.chain.unlinkedBranches[unlinkedHash]
            // console.log('Unlinked chain length', unlinkedBranch.length)
            branch = [ ...branch, ...missingBlocks, ...unlinkedBranch ]
            // console.log('Unlinked chain new length', branch.length)
            let latestBranchedBlock = branch[branch.length - 1]
            // console.log('Last branched block num', latestBranchedBlock.blockNumber)
            let isValidCandidate = await this.chain.validateBranch(latestBranchedBlock, branch)
            if(isValidCandidate){
              let switched = await this.chain.switchToBranch(branch);
              if(switched.error) resolve({error:switched.error})
              resolve({switched:switched})
            }else{
              resolve({fixed:true})
            }
          }
         
        }else if(missingBlocks.isLinked){
          // console.log('Number of linked missing blocks', missingBlocks.length)
          if(!Array.isArray(missingBlocks.isLinked) && typeof missingBlocks.isLinked == 'object'){
            missingBlocks.isLinked = [ missingBlocks.isLinked ]
          }

          if(missingBlocks.isLinked.length == 0){
            resolve({error:'ERROR: Peer could not find any of the missing blocks'})
          }else{
            
            let lastBlock = missingBlocks.isLinked[missingBlocks.isLinked.length - 1]
            // console.log('First missing block', firstBlock)
            let unlinkedBranch = this.chain.unlinkedBranches[lastBlock.hash]
            
            unlinkedBranch = [ ...missingBlocks.isLinked, ...unlinkedBranch ]
            // console.log('Unlinked chain new length', unlinkedBranch.length)
            let latestBranchedBlock = unlinkedBranch[unlinkedBranch.length - 1]
            // console.log('Last branched block num', latestBranchedBlock.blockNumber)
            this.chain.branches[latestBranchedBlock.hash] = unlinkedBranch
            let branch = this.chain.branches[latestBranchedBlock.hash]
            let isValidCandidate = await this.chain.validateBranch(latestBranchedBlock, branch)
            if(isValidCandidate){
              let switched = await this.chain.switchToBranch(branch);
              if(switched.error) resolve({error:switched.error})

              this.broadcast('getBlockchainStatus')
              resolve({switched:switched})
            }else{
              resolve({fixed:true})
            }
          }
          
        }
    })
  }

  
  //Heavy WIP
  getMissingBlocksToSyncBranch(unsyncedBlockHash){
    return new Promise(async (resolve)=>{
      if(!unsyncedBlockHash){
        resolve({error:'ERROR: Need to provide block hash of missing branch block'})
      }else{
        let timeout = setTimeout(()=> resolve({error:'ERROR: Could not find missing blocks to fix unlinked branch'}), 3000)
        let missingBlocks = []
        let peer = await this.getMostUpToDatePeer()
        // console.log('Up to date peer is of type ', typeof peer)
        if(!peer) resolve({error:'ERROR: Could not resolve sync issue. Could not find peer connection'})
        else{
          
          peer.emit('getPreviousBlock', unsyncedBlockHash)
          peer.on('previousBlock', (block)=>{
            
            if(block.end){
              peer.off('previousBlock')
              clearTimeout(timeout)
              resolve({error:block.end})
            }else if(block.error){
              peer.off('previousBlock')
              clearTimeout(timeout)
              resolve({error:block.error})
            }else if(block){
              
              
              let isLinkedToChain = this.chain.getIndexOfBlockHash(block.hash)
              
              missingBlocks = [ block, ... missingBlocks ]
              if(isLinkedToChain){
                peer.off('previousBlock')
                // "Unshifted" manually since we're looking backyards, not forwards
                clearTimeout(timeout)
                resolve({ isLinked:missingBlocks })
                
              }
              
              else{
                
                peer.emit('getPreviousBlock', block.hash)
              }

              
            }
          })
        }
      }


      
    })
  }

  /**
    Broadcast only to this node's connected peers. Does not send peer messages
    @param {string} $eventType - Type of node event
    @param {object} $data - Various data to be broadcasted
  */
  serverBroadcast(eventType, data){
    this.ioServer.emit(eventType, data);
  }

  /**
    Broadcasts a defined event
    @param {string} $eventType - Event type/name
    @param {Object} $data - May be an object or any kind of data
    @param {Object} $moreData - Optional: any kind of data also
    @description - Broadcasts socket events. This is how peer messages are sent
  */
  broadcast(eventType, data){
    try{
      if(this.connectionsToPeers){
          Object.keys(this.connectionsToPeers).forEach((peerAddress)=>{
            this.connectionsToPeers[peerAddress].emit(eventType, data, (acknowledged)=>{
              if(acknowledged){
                //If peer is malicious, could implement a way to reduce their reputation score
                //and close connection if the score is too low
              }else if(eventType == 'peerMessage' && !acknowledge){
                logger(`Peer ${peerAddress} did not acknowledge peerMessage`)
                setTimeout(()=> {
                  //Possibly dangerous
                  logger(`Retrying to send peerMessage`)
                  this.broadcast(eventType, data)
                }, 5000)
              }
            });
          })
        }
    }catch(e){
      console.log(e);
    }

  }

  
  /**
    Relays certain console logs to the web UI
    @param {string} $message - Console log to be sent
    @param {object} $arg - Data of any type that can be console logged on web UI
  */
  outputToUI(message, arg){
    if(this.userInterfaces && message){
      for(var i=0; i < this.userInterfaces.length; i++){
        if(arg){
          //logger('Number of UIs', this.userInterfaces.length);
          this.userInterfaces[i].emit('message', message+' '+arg);
        }else{
          this.userInterfaces[i].emit('message', message);
        }

      }
    }

  }


  /**
    Send an node event to peer
    @param {string} $eventType - Event type/name
    @param {Object} $data - May be an object or any kind of data
    @param {string} $address - peer address
  */
  sendToPeer(eventType, data, address){
    if(address && this.connectionsToPeers[address]){
      try{
        this.connectionsToPeers[address].emit(eventType, data);
      }catch(e){
        console.log(chalk.red(e));
      }
    }
  }

  /**
    Send an node event to peer
    @param {string} $eventType - Event type/name
    @param {Object} $data - May be an object or any kind of data
    @param {string} $address - peer address
    @description - RESTful API to query about blockchain and wallet states
  */
  initChainInfoAPI(app){
    app.get('/getWalletBalance', async(req, res)=>{
        let publicKey = req.query.publicKey;
        if(publicKey){
          let isAccount = await this.chain.accountTable.getAccount(publicKey);
          if(isAccount) publicKey = isAccount.ownerKey

          let state = await this.chain.balance.getBalance(publicKey);
          res.json(state).end()
        }else{
          res.json({error:'ERROR: must provide publicKey'}).end()
        }
      
    })

    app.get('/getWalletHistory', async(req, res)=>{
      if(isValidWalletBalanceJSON(req.query)){
        let publicKey = req.query.publicKey;
        if(publicKey){
          let history = await this.chain.getTransactionHistory(publicKey)
            res.json({ history:history }).end()
        }else{
          res.json({error:'ERROR: must provide publicKey'}).end()
        }
      }else{
        res.json({error:'ERROR: Invalid JSON request parameters'}).end()
      }
    })


    app.get('/getAddress', (req, res)=>{
      res.json({ nodes: this.nodeList.addresses }).end();
    })

    app.get('/getInfo', (req, res)=>{
      res.json(this.getChainInfo()).end()
    })

    app.get('/getBlock', (req, res)=>{
      let blockNumber = req.query.blockNumber;
      if(this.chain instanceof Blockchain && blockNumber && typeof blockNumber == number){
        let block = this.chain.chain[blockNumber]
        if(block){
          res.json(block).end()
        }else{
          res.json({error:'block not found'}).end()
        }
        
      }
    })

    app.get('/getBlockHeader', (req, res)=>{
      let blockNumber = req.query.blockNumber;
      if(this.chain instanceof Blockchain && blockNumber && typeof blockNumber == number){
        let header = this.chain.getBlockHeader(blockNumber)
        if(header){
          res.json(header).end()
        }else{
          res.json({error:'block header not found'}).end()
        }
        
      }
    })
  }


  /**
    Internode API that can be used by UIs to get data from blockchain and send transactions
    @param {Object} $app - Express App
    @description - REST API to broadcast actions and transactions as well as querying for
                   information about them
  */
  initHTTPAPI(app){
    try{
      let rateLimiter = new RateLimit({
        windowMs: 1000, //1 minute window 
        max: 100, // start blocking after 100 requests 
        message: "Too many requests per second"
      });

      app.use(rateLimiter);
      app.use(bodyParser.json());
      app.use(function (error, req, res, next) {
        if (error instanceof SyntaxError &&
          error.status >= 400 && error.status < 500 &&
          error.message.indexOf('JSON')) {
          res.send("ERROR: Invalid JSON format");
        } else {
          next();
        }
      });
      
      app.set('json spaces', 2)
      
      app.get('/transaction', async (req, res)=>{
        let tx = {};
        let pendingTx = {};
        let hash = req.query.hash;
        
        if(hash){
          tx = await this.chain.getTransactionFromDB(hash);
          if(tx){
            res.json(tx).end()
          }else{

            pendingTx = await this.mempool.getTransaction(hash);
            
            if(pendingTx){
              res.json(pendingTx).end()
            }else{
              res.json({ error:'no transaction found'}).end()
            }
            
          }
        }else{
          res.json({ error:'invalid transaction hash'}).end()
        }

      })
  
      app.post('/transaction', (req, res) => {
        
        try{
          if(isValidTransactionJSON(req.body) || isValidTransactionCallJSON(req.body)){
            let transaction = req.body
            
            this.broadcastTransaction(transaction, true)
            .then((transactionEmitted)=>{
              
              if(transactionEmitted.error){
                res.send(transactionEmitted.error)
              }else{
                if(transactionEmitted.value){
                  if(transactionEmitted.value) delete transactionEmitted.value.state
                  
                  let result = { result:transactionEmitted.value, receipt:transaction }
                  res.send(JSON.stringify(result, null, 2));
                }else if(transactionEmitted.isReadOnly){
                  let result = { isReadOnly:true, result:transactionEmitted.isReadOnly, receipt:transaction }
                  res.send(JSON.stringify(result, null, 2));
                }else{
                  let receipt = JSON.stringify(transaction, null, 2)
                  res.send(receipt);
                }
                
              }
            })
            .catch((e)=>{
              console.log(chalk.red(e));
            })
          }else{
            res.send('ERROR: Invalid transaction format')
          }
          
        }catch(e){
          console.log(chalk.red(e))
        }
        
      });

      app.post('/action', (req, res) => {
        
        try{
          if(isValidActionJSON(req.body)){
            let action = req.body
            
            this.broadcastAction(action)
            .then((actionEmitted)=>{
              if(!actionEmitted.error){
                res.send(JSON.stringify(actionEmitted, null, 2));
              }else{
                res.send({error:actionEmitted.error})
              }
            })

          }else{
            res.send('ERROR: Invalid transaction format')
          }
          
        }catch(e){
          console.log(chalk.red(e))
          res.send("ERROR: An Error occurred")
        }
        
      });

      app.post('/testAction', (req, res) => {
        
        try{
          if(isValidActionJSON(req.body)){
            let action = req.body
            
            this.testAction(action)
            .then((actionEmitted)=>{
              if(!actionEmitted.error){
                res.send(JSON.stringify(actionEmitted, null, 2));
              }else{
                res.send({error:actionEmitted.error})
              }
            })
          }else{
            res.send('ERROR: Invalid transaction format')
          }
          
        }catch(e){
          console.log(chalk.red(e))
          res.send("ERROR: An Error occurred")
        }
        
      })

      app.get('/getBlockHeader',(req, res)=>{
        var blockNumber = req.query.hash;
        if(blockNumber){
          res.json(this.chain.getBlockHeader(blockNumber)).end()
        }
      })

    }catch(e){
      logger(e)
    }
    
  }


  


  /**
    Socket listeners only usable by external UIs and APIs
    @param {object} $socket - Client socket connection to this node's server
  */
  externalEventHandlers(socket){
    try{
      this.userInterfaces.push(socket)
      socket.emit('message', 'Connected to local node');

      socket.on('error', (err)=> logger(chalk.red(err)))

      socket.on('connectionRequest', (address)=>{
        this.connectToPeer(address, (peer)=>{});
      });

      socket.on('transaction',async (transaction)=>{
        try{
          if(isValidTransactionJSON(transaction) || isValidTransactionCallJSON(transaction)){
            let transactionEmitted = await this.broadcastTransaction(transaction, true)
            if(transactionEmitted.value){
              delete transactionEmitted.value.state
              let result = { result:transactionEmitted.value, receipt:transaction }
              socket.emit('transactionEmitted',result);
            }else if(transactionEmitted.error){
              socket.emit('transactionEmitted',{ error:transactionEmitted.error });
            }else{
              let receipt = JSON.stringify(transaction, null, 2)
              socket.emit('transactionEmitted',transaction);
            }
          }else{
            socket.emit('transactionEmitted', { error:'ERROR: Invalid transaction format' })
          }
        }catch(e){
          console.log('ERROR:',e)
        }
      })

      socket.on('getBlockchain', ()=>{
        console.log(this.chain.chain)
      })

      socket.on('getAddress', (address)=>{
        this.requestKnownPeers(address);
      })

      socket.on('getBalance', async (publicKey)=>{
        console.log(await this.chain.getBalance(publicKey))
        let balance = 0;
        
      })

      socket.on('getKnownPeers', ()=>{
        logger(this.nodeList.addresses)
        socket.emit('knownPeers', this.nodeList.addresses);
      })

      socket.on('getInfo', ()=>{
        socket.emit('chainInfo', this.getChainInfo());
      })

      socket.on('startLookingForPeers', (method)=>{
        if(method == 'dht'){
          this.findPeersThroughBittorrentDHT()
        }else if(method == 'dnssd'){
          this.findPeersThroughDNSSD()
        }
      })

      socket.on('getContract', async (name)=>{
          let contract = await this.chain.contractTable.getContract(name)
          console.log(contract)
      })

      socket.on('getContractState', async (blockNumber, contractName)=>{
        let storage = await this.chain.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          if(!blockNumber) blockNumber = this.chain.getLatestBlock().blockNumber;
          let block = this.chain.chain[blockNumber]
          let timestamp = block.timestamp
          let state = await storage.getClosestState(timestamp)
          socket.emit('contractState', state)
        }
      })

      socket.on('getCurrentContractState', async (contractName)=>{
        
        let storage = await this.chain.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          console.log('Got storage', storage)
          let state = await storage.getCurrentState()
          socket.emit('contractState', state)
          console.log(JSON.stringify(state, null, 2))
        }
      })

      socket.on('getClosestContractState', async (blockNumber, contractName)=>{
        
        let storage = await this.chain.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          let state = await storage.getClosestState(blockNumber)
          socket.emit('contractState', state)
          console.log(JSON.stringify(state, null, 2))
        }
      })

      socket.on('getLatestContractState', async (contractName, blockNumber)=>{
        
        let storage = await this.chain.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          let block = this.chain.chain[blockNumber]
          console.log('Block is', block.blockNumber)
          let timestamp = block.timestamp
          let state = await storage.getClosestState(timestamp)
          
          console.log(JSON.stringify({closest:state}, null, 2))
          socket.emit('contractState', state)
          // console.log(JSON.stringify(state, null, 2))
        }
      })

      socket.on('getLatestKeyContractState', async (contractName)=>{
        
        let storage = await this.chain.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          let key = await storage.database.database.get('TokensStorage','*', require('rocket-store')._ORDER_DESC)
          console.log('Key',JSON.stringify({key:key}, null, 2))
        }
      })

      socket.on('testRollback', async (contractName, blockNumber)=>{
        
        let storage = await this.chain.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          // let rolledback = await storage.testRollback(blockNumber)
          // console.log(JSON.stringify(rolledback, null, 2))
          let closest = await storage.getClosestState(1578103408175)
          console.log(JSON.stringify(closest, null, 2))
        }
      })

      socket.on('getContractAPI', async (name)=>{
          let contract = await this.chain.contractTable.getContract(name)
          if(contract){
            let api = contract.contractAPI;
            socket.emit('api', api)
          }else{
            socket.emit('api', 'Not Found')
          }
          
      })

      socket.on('getAccount', async (name)=>{
        try{
          let result = await this.chain.accountTable.accountsDB.get(name)
          console.log(result)
        }catch(e){
          console.log(e)
        }
          
          
      })

      socket.on('getAllAccounts', async (ownerKey)=>{
        try{
          // let result = await this.chain.accountTable.getAccountsOfKey(ownerKey)
          let allAccounts = await this.chain.accountTable.getAccountsOfKey(ownerKey)
          if(allAccounts){
            socket.emit('accounts', allAccounts)
          }else{
            socket.emit('accounts', {})
          }
          
        }catch(e){
          console.log(e)
        }
          
          
      })

      socket.on('getChain', ()=>{
        console.log(this.chain.chain)
      })

      socket.on('getState', async (contractName)=>{
          let state = await this.chain.contractTable.getState(contractName)
          console.log(JSON.stringify(state,null,2))
      })

      socket.on('getStateEntry', async (contractName)=>{
        let state = await this.chain.contractTable.getStateEntry(contractName)
        console.log(JSON.stringify(state,null,2))
      })

      socket.on('getBlockHeader', (blockNumber)=>{
        let block = this.chain.chain[blockNumber];
        socket.emit('header', { header:block })
      })

      socket.on('getStateOfAction', async (name, hash)=>{
        let state = await this.chain.contractTable.getStateOfAction(name, hash)
        console.log(JSON.stringify(state, null, 2))
      })

      socket.on('getBlock', async(blockNumber)=>{
        let block = await this.chain.getBlockFromDB(blockNumber)
        if(block){
          socket.emit('block', block)
        }
      })

      socket.on('isChainValid', async ()=>{
        let isValidChain = await this.validateBlockchain();
        if(isValidChain){
          logger('Blockchain is valid')
        }
      })

      socket.on('showBalances', ()=>{
        console.log(JSON.stringify(this.chain.balance.states, null, 2))
      })

      socket.on('showBlockState', async (number)=>{
        let state = await this.chain.balance.stateDB.get(number.toString())
        console.log(JSON.stringify(state, null, 1))
      })

      socket.on('getBlockSize', async (blockNumber)=>{
        let block = await this.chain.getBlockFromDB(blockNumber)
        console.log('Block', require('json-size')(block))
      })

      socket.on('showBalanceHistory', async ()=>{
        let history = {}
        for(var block of this.chain.chain){
          let state = await this.chain.balance.stateDB.get(block.blockNumber.toString())
          if(state && !state.error){
            history[block.blockNumber] = state.blockState.states
          }
        }

        console.log(history)
      })

     socket.on('tryPing', async ()=>{
       console.log(JSON.stringify(Object.keys(this.chain.spentTransactionHashes)))
       console.log('Has 7edcbe8969fd351b6b0ff8c12664a3298f15da5ba71b10674a23551c7783d776')
       console.log(this.chain.spentTransactionHashes['7edcbe8969fd351b6b0ff8c12664a3298f15da5ba71b10674a23551c7783d776'])
     })


      socket.on('verbose', ()=>{
        
        if(this.verbose){
          this.UILog('Verbose set to OFF');
          this.verbose = false;
          
        }else{
          this.UILog('Verbose set to ON');
          this.verbose = true;
        }
        
        socket.emit('verboseToggled', this.verbose)
      
      })

      socket.on('update', ()=>{
        this.broadcast('getBlockchainStatus');
      })

      socket.on('forceReceiveBlocks', ()=>{
        logger('Will now receive new blocks mined on the network')
        this.update = true
      })

      socket.on('getMempool', ()=>{
        socket.emit('mempool', { transactions:this.mempool.txReceipts, actions:this.mempool.actionReceipts });
      })

      socket.on('stopMining', ()=>{
        console.log('Stopping miner')
        this.localServer.socket.emit('stopMining')
      })

      socket.on('requestPeers', ()=>{
        this.findPeers()
      })
      
      socket.on('rollback', async (number)=>{
        let rolledback = await this.chain.rollbackToBlock(number)
        
        socket.emit('rollbackResult', rolledback)
      })

      socket.on('getTransactionFromDB', async (hash)=>{
        let transaction = await this.chain.getTransactionFromDB(hash)
        console.log(transaction)
      })

      socket.on('getActionFromDB', async (hash)=>{
        let action = await this.chain.getActionFromDB(hash)
        console.log(action)
      })

      socket.on('disconnect', ()=>{
        var index = this.userInterfaces.length
        this.userInterfaces.splice(index-1, 1)
      })
    }catch(e){
      console.log(e);
    }
    
  }

  localAPI(){

    let app = express()
    app.use(express.static(__dirname+'/views'));
    express.json({ limit: '300kb' })
    app.use(helmet())

    this.initChainInfoAPI(app);
    this.initHTTPAPI(app);

    const server = http.createServer(app)
    server.listen(this.minerPort, 'localhost');
    this.localServer = socketIo(server);

    logger('Local API accessible on ',this.minerPort)
    this.localServer.on('connection',(socket)=>{

      let token = socket.handshake.query.token;

      if(token && token == 'InitMiner'){
        this.minerConnector(socket)
      }else{
        socket.emit('message', 'Connected to local node');
        this.externalEventHandlers(socket)
      }
    })
   
  }

  async minerConnector(api){
    logger('Miner connected!');
    api.hasSentBlock = false
    api.isBuildingBlock = false

    const sendNextBlock = async (minerPreviousBlock) =>{
      if(!this.isDownloading && !api.hasSentBlock && !api.isMining){
        let nextBlock = await getLatestBlock()
        let newRawBlock = await createRawBlock(nextBlock)
        if(!newRawBlock.error) {
            api.hasSentBlock = true
            api.emit('startMining', newRawBlock)
        }else{
          api.emit('wait')
          // console.log(newRawBlock.error)
        }
      }else{
        return { error:'Node is busy' }
      }
    }

    const getLatestBlock = async () =>{
      let latestHeader = this.chain.getLatestBlock()
      let block = await this.chain.getBlockFromDB(latestHeader.blockNumber)
      if(!block || block.error){
        block = await this.chain.getBlockFromDB(latestHeader.blockNumber - 1)
      }

      return block
    }

    const unwrapBlock = async (block) =>{
      if(block){
        let putback = await this.mempool.putbackTransactions(block)
        if(putback.error) return {error:putback.error}
        if(block.actions){
          let actionsPutback = await this.mempool.putbackActions(block)
          if(actionsPutback.error) return {error:actionsPutback.error}
        }
        return { transactions:putback, actions:putback }
      }else{
        return false
      }
    }
    
    const createRawBlock = async (nextBlock=this.chain.getLatestBlock()) =>{
      
      if(!this.isDownloading && !api.isBuildingBlock && !api.isMining && !api.isValidatingBlock){
        if(this.mempool.sizeOfPool() > 0 || this.mempool.sizeOfActionPool() > 0){
          let latest = await getLatestBlock()

          api.isBuildingBlock = true

          let deferredTxManaged = await this.mempool.manageDeferredTransactions(latest)
          if(deferredTxManaged.error) console.log('DEFERRED TX ERROR: ', deferredTxManaged.error)

          let transactions = await this.mempool.gatherTransactionsForBlock()
          if(transactions.error) console.log('Mempool error: ',transactions.error)
          transactions = await this.chain.validateTransactionsBeforeMining(transactions)

          let deferredActionsManaged = await this.mempool.manageDeferredActions(latest)
          if(deferredActionsManaged.error) console.log('DEFERRED ACTIONS ERROR: ', deferredActionsManaged.error)

          let actions = await this.mempool.gatherActionsForBlock()
          if(actions.error) console.log('Mempool error:',actions.error)
          actions = await this.chain.validateActionsBeforeMining(actions)
          if(Object.keys(transactions).length == 0 && Object.keys(actions).length == 0) return { error:'Could not create block without transactions or actions' }
          
          let rawBlock = {
            timestamp:Date.now(),
            transactions:transactions,
            actions:actions,
            previousHash:nextBlock.hash,
            blockNumber:nextBlock.blockNumber + 1
          } 
  
          api.isBuildingBlock = false
          return rawBlock
        }else{
          return { error:'ERROR: Mempool is empty' }
        }
      }else{
        
        // console.log({ error:{
        //   message:'ERROR: Node is unable to create new block',
        //   reason:{
        //     isDownloading:this.isDownloading,
        //     isBusy:this.chain.isBusy,
        //     isBuildingBlock:api.isBuildingBlock,
        //     isValidating:api.isValidatingBlock,
        //     isMining:api.isMining
        //   }
        // },  })

        return { error:{
          message:'ERROR: Node is unable to create new block',
          reason:{
            isDownloading:this.isDownloading,
            isBusy:this.chain.isBusy,
            isBuildingBlock:api.isBuildingBlock
          }
        },  }
      }
    }

    

    api.on('mining', (block)=>{
      api.isMining = true
    })

    api.on('miningOver', ()=>{
      api.isMining = false
    })

    api.on('miningCancelled', async (block)=>{
      let blockUnwrapped = await unwrapBlock(block)
      if(blockUnwrapped.error) console.log(`UNWRAP ERROR: ${blockUnwrapped.error}`)
      
      api.isBuildingBlock = false
    })

    api.on('isNewBlockReady', async (minerPreviousBlock)=>{
      let sent = await sendNextBlock(minerPreviousBlock)
      
    })

    api.on('getNewBlock', async ()=>{
      api.hasSentBlock = false
      await sendNextBlock()
    })
  
    this.mempool.events.on('newAction', (action)=>{
      api.emit('actionSent')
    })
    this.mempool.events.on('newTransaction', async (transaction)=>{
      api.emit('transactionSent')
    })

    

    api.on('newBlock', async (block)=>{
      if(this.isDownloading || this.chain.isBusy){
        api.emit('stopMining')
        // console.log('Stopped mining')
        // console.log('Chain busy:', this.chain.isBusy)
        // console.log('Has sent block:', api.hasSentBlock)
        // console.log('Is building block', api.isBuildingBlock)
        // console.log('Is validating', api.isValidatingBlock)
      }
      else{
        if(block){
          api.emit('stopMining')
          api.hasSentBlock = false
          
          this.chain.isBusy = true
          api.isValidatingBlock = true

          let isValid = await this.chain.validateBlock(block)
          if(isValid){
            if(isValid.error) console.log('Is not valid mined block', isValid.error)
            else{
              let added = await this.chain.addBlockToChain(block)
              if(added.error){
                // logger('MinerBlock Error:',added.error)
              }
              else{
                this.sendPeerMessage('newBlockFound', block);
                let latest = await getLatestBlock()
                api.emit('latestBlock', latest)
              }
              api.isBuildingBlock = false
              this.chain.isBusy = false
            }
            
            
          }else{
            console.log('ERROR: Mined Block is not valid!')
            api.hasSentBlock = false
            this.chain.isBusy = false
          }
         
          api.isValidatingBlock = false
        }else if(block.failed){
          logger('Miner was interrupted')
          api.emit('latestBlock', this.chain.getLatestBlock())
          api.hasSentBlock = false
        }else{
          logger('ERROR: New mined block is undefined')
        }
      }
      
    })

    api.on('getLatestBlock', async (minersPreviousBlock)=>{
      
      if(this.chain instanceof Blockchain){
        let latest = await getLatestBlock()
        api.emit('latestBlock', latest)
      }else{
        api.emit('error', {error: 'Chain is not ready'})
      }
    })

    api.on('disconnect', ()=>{
      this.mempool.events.removeAllListeners('newAction')
      this.mempool.events.removeAllListeners('newTransaction')
    })
    let latest = await getLatestBlock()
    api.emit('latestBlock', latest)
    
  
    this.localServer.socket = api
  }


  /**
    Basis for gossip protocol on network
    Generates a message uid to be temporarilly stored by all nodes
    to avoid doubles, then erased so that memory does not overflow.
    @param {string} $type - peer message type
  */
  sendPeerMessage(type, data){
    if(type){
      try{
        if(typeof data == 'object')
          data = JSON.stringify(data);
          var shaInput = (Math.random() * Date.now()).toString()
          var messageId = sha256(shaInput);
          this.messageBuffer[messageId] = messageId;
          this.broadcast('peerMessage', { 
            'type':type, 
            'messageId':messageId, 
            'originAddress':this.address, 
            'data':data,
            'relayPeer':this.address
          });

      }catch(e){
        console.log(chalk.red(e));
      }

    }
  }

  /**
    @param {String} $type - Peer message type
    @param {String} $originAddress - IP Address of sender
    @param {Object} $data - Various data (transactions to blockHash). Contains messageId for logging peer messages
  */
  async handlePeerMessage({ type, originAddress, messageId, data, relayPeer }, acknowledge){
      
    if(data){
      try{
        let peerMessage = { 
          'type':type, 
          'originAddress':originAddress, 
          'messageId':messageId, 
          'data':data,
          'relayPeer':relayPeer 
        }
          this.messageBuffer[messageId] = peerMessage;
        acknowledge({received:messageId})
          switch(type){
            case 'transaction':
              var transaction = JSON.parse(data);
              this.receiveTransaction(transaction);
              break;
            case 'action':
              let action = JSON.parse(data);
              let executed = await this.receiveAction(action);
              if(executed.error) console.log(executed.error)
              break
            case 'newBlockFound':
              if(!this.chain.isBusy){
                this.chain.isBusy = true
                let added = await this.handleNewBlockFound(data, originAddress, peerMessage);
                this.chain.isBusy = false;
                if(added){
                  if(added.error){
                    logger(chalk.red('REJECTED BLOCK:'), added.error)
                  }

                }
              }
              break;
            
          }
          
          this.broadcast('peerMessage', peerMessage)
        
      }catch(e){
        console.log(e)
      }  
    }
    
  }
  /**
    @param {Object} $transaction - New transaction emitted on the network
  */
  receiveTransaction(transaction){
    if(transaction && this.chain instanceof Blockchain){
      if(isValidTransactionJSON(transaction) || isValidTransactionCallJSON(transaction)){

        this.chain.validateTransaction(transaction)
        .then(async (valid) => {
          if(!valid.error){
            let added = await this.mempool.addTransaction(transaction);
            this.UILog('<-'+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(this.verbose) logger(chalk.green('<-')+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
          }else{
            this.UILog('!!!'+' Received invalid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(this.verbose) logger(chalk.red('!!!'+' Received invalid transaction : ')+ transaction.hash.substr(0, 15)+"...")
            logger(valid.error)
          }
        })
        

      }
    }
  }

  receiveAction(action){
    return new Promise(async (resolve)=>{
      if(!isValidActionJSON(action)) resolve({error:'ERROR: Received action of invalid format'})

      let isValid = await this.chain.validateAction(action)
      if(!isValid || isValid.error){
        if(this.verbose) logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
        resolve({error:isValid.error})
      }else{
        //Action will be added to this.mempool only is valid and if corresponds with contract call
        let added = await this.mempool.addAction(action)
        resolve({action:action})
      }
    })
  }

  getChainInfo(){
    let info = {
      chainLength:this.chain.chain.length,
      headBlockNumber:this.chain.getLatestBlock().blockNumber,
      headBlockHash:this.chain.getLatestBlock().hash,
      lastBlockTime:displayDate(new Date(this.chain.getLatestBlock().timestamp)),
      totalDifficulty:this.chain.getTotalDifficulty(),
      minedBy:this.chain.getLatestBlock().minedBy,
    }
    return info
  }

  handleNewBlockFound(data, fromPeer, peerMessage){
    return new Promise( async (resolve)=>{
      if(this.chain instanceof Blockchain && data){
        if(!this.isDownloading){
          try{

            let block = JSON.parse(data);
            let alreadyReceived = await this.chain.getBlockbyHash(block.hash)
            let alreadyIsInActiveBranch = this.chain.branches[block.hash];
  
            if(!alreadyReceived && !alreadyIsInActiveBranch){
              //Need to validate more before stopping miner

              if(this.chain.validateBlockHeader(block)){

                this.broadcast('peerMessage', peerMessage)

                this.peersLatestBlocks[fromPeer] = block

                let minerOn = this.localServer && this.localServer.socket
                
                this.isValidatingPeerBlock = true

                if(minerOn){
                  this.localServer.socket.emit('stopMining', block)
                  this.localServer.socket.isBuildingBlock = false
                  let putback = await this.mempool.deleteTransactionsOfBlock(block.transactions)
                  if(putback.error) resolve({error:putback.error})
                  if(block.actions){
                    let actionsPutback = await this.mempool.deleteActionsOfBlock(block.actions)
                    if(actionsPutback.error) resolve({error:actionsPutback.error})
                  }
                }

                
                let added = await this.chain.pushBlock(block);
                if(added.error){
                  this.isValidatingPeerBlock = false
                  resolve({error:added.error})
                }
                else{
                  let currentLength = this.chain.length;

                  this.isValidatingPeerBlock = false
                  //If not linked, stop mining after pushing the block, to allow more time for mining on this node
                  if(added.findMissing){
                    
                    let fixed = await this.fixUnlinkedBranch(added.findMissing);
                    if(fixed.error) resolve({error:fixed.error})
                    else resolve(fixed)

                  }else if(added.switched && added.switched.outOfSync){
                    
                    let rolledback = await this.chain.rollbackToBlock(currentLength - 5)
                    this.broadcast('getBlockchainStatus')
                    resolve(rolledback)
                  }else if(added.unlinked){
                    
                    let fixed = await this.fixUnlinkedBranch(added.unlinked);
                    if(fixed.error) resolve({error:fixed.error})
                    else resolve(fixed)

                  }else if(added.unlinkedExtended){
                    
                    let fixed = await this.fixUnlinkedBranch(added.unlinkedExtended);
                    if(fixed.error) resolve({error:fixed.error})
                    else resolve(fixed)
                    
                  }else{
                    if(minerOn){
                      this.localServer.socket.emit('latestBlock', this.chain.getLatestBlock())
                      this.localServer.socket.hasSentBlock = false
                    }
                    
                    resolve(added)
                  }
                }
  
              }else{
                resolve({error:'ERROR:New block header is invalid'})
              }
            }else{
              resolve({error:'ERROR: Block already received in chain or in branch'})
            }
          }catch(e){
            resolve({error:e.message})
          }
        }else{
          resolve({error:'ERROR: Node is busy, could not add block'})
        }
      }else{
        resolve({error:'ERROR: Missing parameters'})
      }
    })
    
  }


  async validateBlockchain(allowRollback){
    if(this.chain instanceof Blockchain){
      let isValid = this.chain.isChainValid();
      if(isValid.conflict){
        let atBlockNumber = isValid.conflict;
        if(allowRollback){
          let rolledback = await this.chain.rollbackToBlock(atBlockNumber-1);
          logger('Rolled back chain up to block number ', atBlockNumber-1)
          return true;
        }else{
          return false;
        }
      }

      return true;
    }
  }

 

   /**
    @param {number} $number - Index of block from which to show block creation time
   */
  showBlockTime(number){
     try{
       if(this.chain instanceof Blockchain){
         var latestBlock = this.chain.chain[number];
         var indexBeforeThat = latestBlock.blockNumber-1;
         var blockBeforeThat = this.chain.chain[indexBeforeThat];
         return ((latestBlock.timestamp - blockBeforeThat.timestamp)/1000)
       }
     }catch(e){
       console.log(chalk.red(e))
     }

  }


  rollBackBlocks(blockIndex){  //Tool to roll back conflicting blocks - To be changed soon
    if(typeof blockIndex == 'number' && this.chain instanceof Blockchain){
      var sideChain = [];
      sideChain = this.chain.chain.splice(blockIndex);
      
      return sideChain;
    }
  }

/**
 * @desc Emits all transactions as peerMessages.
   @param {string} $sender - Sender of coins's Public key
   @param {string} $receiver - Receiver of coins's Public key
   @param {number} $amount - Amount of coins to send. Optional IF blockbase query
   @param {object} $data - data to send along with transaction
 */
   broadcastTransaction(transaction, test){
    return new Promise(async (resolve)=>{
      try{
          if(this.chain instanceof Blockchain){
            if(!transaction.signature){
              logger('Transaction signature failed. Missing signature')
              resolve({error:'Transaction signature failed. Missing signature'})
              
            }else{
              
              this.chain.createTransaction(transaction)
                .then( async (valid) =>{
                  if(!valid.error){

                    let txBroadcasted = await this.handleTransactionType(transaction, test)
                    if(txBroadcasted.error){
                      this.UILog('!!!'+' Rejected transaction : '+ transaction.hash.substr(0, 15)+"...")
                      if(this.verbose) logger(chalk.red('!!!'+' Rejected transaction : ')+ transaction.hash.substr(0, 15)+"...")
                      resolve({error:txBroadcasted.error});
                    }else if(txBroadcasted.isReadOnly){
                      resolve({ value: txBroadcasted.isReadOnly });
                    }else{
                      this.sendPeerMessage('transaction', JSON.stringify(transaction, null, 2)); 
                      this.UILog('->'+' Emitted transaction : '+ transaction.hash.substr(0, 15)+"...")
                      if(this.verbose) logger(chalk.cyan('->'+' Emitted transaction : ')+ transaction.hash.substr(0, 15)+"...")
                      resolve(txBroadcasted);
                    }
                    

                  }else{
  
                    this.UILog('!!!'+' Rejected transaction : '+ transaction.hash.substr(0, 15)+"...")
                    if(this.verbose) logger(chalk.red('!!!'+' Rejected transaction : ')+ transaction.hash.substr(0, 15)+"...")
                    resolve({error:valid.error});
  
                  }
                })
            }
          }
         
        
        
      }catch(e){
        console.log(chalk.red(e));
      }
      
    })
  }

  convertTransactionCallToAction(transaction){
    return {
      fromAccount: transaction.fromAddress,
      data:{
        contractName: transaction.toAddress,
        method: transaction.data.method,
        params: transaction.data.params,
        memory: transaction.data.memory,
        cpuTime: transaction.data.cpuTime
      },
      hash:transaction.hash,
      transaction:transaction
    }
  }

  handleTransactionType(transaction, test){
    return new Promise(async (resolve)=>{
        if(transaction.type == 'call'){
          let call = this.convertTransactionCallToAction(transaction)
          
          if(!isValidCallPayloadJSON(call.data)) resolve({error:'ERROR: Must provide valid call structure'})
          let contract = await this.chain.contractTable.getContract(call.data.contractName)
          //Checking if the method invoked is open to external execution
          let contractAPI = contract.contractAPI
          if(!contractAPI) resolve({ error:'ERROR: Contract does not have an API' })
          
          let contractMethod = contractAPI[call.data.method];
          
          if(!contractMethod) resolve({error:'ERROR Unknown contract method'})
          else{
            if(contractMethod.type == 'get'){
              //'Get' methods dont modify contract state, obviously
              let result = await this.chain.testCall(call)
              if(result.error) resolve({error:result.error})
              else if(result){
                resolve({ isReadOnly:result , call:call} )
              }
    
            }else if(contractMethod.type == 'set'){
              //'Set' method may modify state.
              //Could implement a way to protect contract state from arbitrary
              //modifications while still allowing authorized accounts to modifiy it
              //legitimately.
              if(test){
                let result = await this.chain.testCall(call)
              
                if(result.error) resolve({error:result.error})
                else{
                  //Transactions added to pool for confirmation by peers blocks or by this
                  //node's miner's blocks. 
                  let added = await this.mempool.addTransaction(transaction);
                  if(added.error){
                    resolve({error:added.error})
                  }else{
                    if(result.executed && result.executed.value){
                      resolve(result.executed.value)
                    }else{
                      resolve(result)
                    }
                  }
                }
              }else{
                let added = await this.mempool.addTransaction(transaction);
                  if(added.error){
                    resolve({error:added.error})
                  }else{
                    resolve(added)
                  }
              }
    
            }else if(contractMethod.type == 'internal'){
              resolve({error:`An internal method may not be called from outside a contract`})
            }else{
              resolve({error:`Invalid contract method type on api of contract ${contract.name}`})
            }
          }
          
        }else if(transaction.type == 'allocation'){
          //Validate stake and broadcast or reject
        }else if(transaction.type == 'stake'){
          //Validate stake and broadcast or reject
        }else if(transaction.type == 'Contract Action'){
          resolve({error:'ERROR: Contract actions may only be created from within a contract'})
        }else{
          //Simple transaction
          let added = await this.mempool.addTransaction(transaction);
            if(added.error){
              resolve({error:added.error})
            }else{
            
              resolve(transaction)
            }
        }
    })
  }

  broadcastAction(action){
    return new Promise(async (resolve)=>{
      if(!isValidActionJSON(action)) resolve({error:'ERROR: Received action of invalid format'})
      let isContractAction = action.type == 'contract action'
      if(isContractAction) resolve({error:'ERROR: Contract actions may only be created from within a contract'})
      else{
        let isValid = await this.chain.validateAction(action)
        if(!isValid || isValid.error){
          if(this.verbose) logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
          resolve({error:isValid.error})
        }else{
  
          let success = await this.chain.testHandleAction(action)
          if(success.error) resolve({error:success.error})
          else if(!success.error){
            if(success.isReadOnly){
              resolve({isReadOnly:true, action:action, success:success.isReadOnly})
            }else{
              this.sendPeerMessage('action', JSON.stringify(action, null, 2)); //Propagate action
              //Action will be added to this.mempool only is valid and if corresponds with contract call
              if(this.verbose) logger(chalk.blue('-»')+' Emitted action: '+ action.hash.substr(0, 15)+"...")
              let added = await  this.mempool.addAction(action)
              resolve({action:action, success:success})
            }
            
          }
          
        }
      }

        
    })
  }

  testAction(action){
    return new Promise(async (resolve)=>{
      if(!isValidActionJSON(action)) resolve({error:'ERROR: Received action of invalid format'})

      let isValid = await this.chain.validateAction(action)
      if(!isValid || isValid.error){
        resolve({error:isValid.error})
      }else{
        let result = await this.chain.testHandleAction(action)
        if(result.error) resolve({error:result.error})
        else resolve({action:action, result:result})
      }
        
    })
  }



  save(){
    return new Promise(async (resolve, reject)=>{
      try{
        let blockchainSaved = await this.chain.save()
        let savedStates = await this.chain.balance.saveBalances(this.chain.getLatestBlock());
        let savedNodeList = await this.nodeList.saveNodeList();
        let savedMempool = await this.mempool.saveMempool();
        let savedWalletManager = await this.walletManager.saveState();
        let savedNodeConfig = await this.saveNodeConfig();
        if( 
               blockchainSaved
            && savedNodeList 
            && savedMempool
            && savedWalletManager
            && savedNodeConfig
            && savedStates
          )
          {
            resolve(true)
          }else{
            reject({error:'ERROR: Could not save all files'})
          }
        
      }catch(e){
        reject({error:e})
      }
      
    })
    
    
    
  }

  async savePortConfig(){
    let written = await writeToFile(`
PORT=${this.port}
API_PORT=${this.minerPort}
DHT_PORT=${this.peerDiscoveryPort}
    `,'./config/.env')
    return written;
  }

  

  async saveNodeConfig(){
    return new Promise(async (resolve, reject)=>{
      let config = {
        host:this.host,
        port:this.port,
        id:this.id,
        publicKey:this.publicKey,
        fastSync:this.fastSync
      }
  
      let saved = await writeToFile(JSON.stringify(config, null, 2),'./config/nodesconfig.json');
      if(saved){
        logger('Saved node config')
        resolve(true)
      }else{
        reject('ERROR: Could not save node config')
      }
      
    })
    
  }

  /**
    @desc Routine tasks go here. The heartbeat's delay is adjusted in nodeconfig
  */
  heartbeat(){
    var that = this;
    setInterval(async ()=>{
      that.messageBuffer = {};
      this.chain.save()
      
      let backUp = await this.chain.saveLastKnownBlockToDB()
      if(backUp.error) console.log('Heartbeat ERROR:', backUp.error)
    }, this.messageBufferCleanUpDelay)
  }

  UILog(message, arg){
    if(arg){
      this.outputToUI(message, arg)
    }else{
      this.outputToUI(message)
    }
  }
}


module.exports = Node
