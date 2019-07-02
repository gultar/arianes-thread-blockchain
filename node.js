//node.js

'use strict'

/********HTTP Server and protection************/
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const RateLimit = require('express-rate-limit');
const helmet = require('helmet');
//*********** Websocket connection**************/
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
//************Blockchain classes****************/
// const Wallet = require('./backend/classes/wallet');
const Blockchain = require('./backend/classes/chain');
// const Transaction = require('./backend/classes/transaction');
const NodeList = require('./backend/classes/nodelist');
const WalletManager = require('./backend/classes/walletManager');
const AccountCreator = require('./backend/classes/accountCreator');
const AccountTable = require('./backend/classes/accountTable');
/*************Smart Contract VM************** */
const callRemoteVM = require('./backend/contracts/build/callRemoteVM')
/**************Live instances******************/
const Mempool = require('./backend/classes/mempool'); //Instance not class


/****************Tools*************************/
const { displayTime, displayDate, logger, writeToFile, readFile, isHashPartOfMerkleTree } = require('./backend/tools/utils');
const {
  isValidTransactionJSON,
  // isValidChainLengthJSON,
  // isValidWalletRequestJSON,
  // isValidGetNextBlockJSON,
  // isValidHeaderJSON,
  // isValidCreateWalletJSON,
  // isValidUnlockWalletJSON,
  isValidWalletBalanceJSON,
  isValidActionJSON,
  isValidBlockJSON
} = require('./backend/tools/jsonvalidator');
const sha256 = require('./backend/tools/sha256');
const sha1 = require('sha1')
const chalk = require('chalk');
const fs = require('fs');
const { RateLimiterMemory } = require('rate-limiter-flexible');


/**
  Instanciates a blockchain node
  @constructor
  @param {string} $address - Peer Ip address
  @param {number} $port - Connection on port
*/

class Node {
  constructor(options){
    if(!options){
      options.address = 'http://localhost:8000'
      options.port = 8000;
      options.id = sha1(Math.random() * Date.now());
    }
    //Basic node configs
    this.address = options.address,
    this.port = options.port
    this.id = options.id;
    this.publicKey = options.publicKey;
    this.verbose = options.verbose;
    //Network related parameters
    this.ioServer = {};
    this.userInterfaces = [];
    this.peersConnected = {}; //From ioServer to ioClient
    this.connectionsToPeers = {}; //From ioClient to ioServer
    this.messageBuffer = {};
    this.messageBufferCleanUpDelay = 30 * 1000;
    this.chain = {};
    this.blocksToValidate = []
    this.updated = false;
    this.isDownloading = false;
    this.minerStarted = false;
    this.miner = {};
    this.nodeList = new NodeList();
    this.walletManager = new WalletManager();
    this.accountCreator = new AccountCreator();
    this.accountTable = new AccountTable();
  }


  /**
    P2P Server with two main APIs. A socket.io API for fast communication with connected peers
    and an HTTP Api for remote peer connections as well as routine tasks like updating blockchain.
  */
  startServer(){

    return new Promise(async (resolve)=>{
      try{

        console.log(chalk.cyan('\n******************************************'))
        console.log(chalk.cyan('*')+' Starting node at '+this.address);
        console.log(chalk.cyan('******************************************\n'))
        
        let nodeListLoaded = await this.nodeList.loadNodeList();
        let mempoolLoaded = await Mempool.loadMempool();
        let accountsLoaded = await this.accountTable.loadAllAccountsFromFile();
        this.chain = await Blockchain.initBlockchain()
        
        if(!this.chain) resolve({error:'Could not load Blockchain file'});
        if(!nodeListLoaded) resolve({error:'Could not load node list'})
        if(!mempoolLoaded) resolve({error:'Could not load Mempool'});
        if(!accountsLoaded) resolve({error:'Could not load account table'})
        
        logger('Loaded peer node list');
        logger('Loaded Blockchain');      
        logger('Loaded transaction mempool');
        logger('Number of transactions in pool: '+Mempool.sizeOfPool());     
        logger('Loaded account table');

        let app = express()
        app.use(express.static(__dirname+'/views'));
        express.json({ limit: '300kb' })
        app.use(helmet())
        const server = http.createServer(app).listen(this.port);
        // const options = await this.getCertificateAndPrivateKey();
        // const server = require('https').createServer(options).listen(this.port)
        this.loadNodeConfig()
        this.initChainInfoAPI(app);
        this.initHTTPAPI(app);
        this.cleanMessageBuffer();
        this.minerConnector();

        this.ioServer = socketIo(server, { 'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':true });
  
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
      }catch(e){
        console.log(e)
        resolve({error:e})
      }
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
        let timestamp = Date.now();
        let randomOrder = Math.random();
        try{
          peer = ioClient(address, {
            'reconnection limit' : 1000,
            'max reconnection attempts' : 3,
            'pingInterval': 2000, 
            'pingTimeout': 10000,
            'query':
            {
              token: JSON.stringify({ 'address':this.address, 'publicKey':this.publicKey}),
            }
          });

          peer.heartbeatTimeout = 120000;

          if(this.verbose) logger('Requesting connection to '+ address+ ' ...');
          this.UILog('Requesting connection to '+ address+ ' ...');

          peer.on('connect_timeout', (timeout)=>{
            if(connectionAttempts >= 3) { 
              peer.destroy()
              // delete this.connectionsToPeers[address];
            }else{
              connectionAttempts++;
            }
              
          })

          peer.on('error', (error)=>{
            console.log(error)
          })


          peer.on('connect', () =>{
            if(!this.connectionsToPeers[address]){
              
              peer.emit('connectionRequest', {address:this.address});
              logger(chalk.green('Connected to ', address))
              this.UILog('Connected to ', address+' at : '+ displayTime())
              peer.emit('message', 'Connection established by '+ this.address);
              let status = {
                totalDifficultyHex: this.chain.getTotalDifficulty(),
                bestBlockHeader: this.chain.getLatestBlock(),
                length: this.chain.chain.length
              }
              setTimeout(()=>{ peer.emit('getBlockchainStatus', status); },5000);
              this.connectionsToPeers[address] = peer;
              this.nodeList.addNewAddress(address)
              
            }else{
              // this.connectionsToPeers[address] = peer;
              // logger('Already connected to target node')
            }
          })

          peer.on('newPeers', (peers)=> {
            if(peers && typeof peers == Array){
              peers.forEach(addr =>{
                //Validate if ip address
                if(!this.nodeList.addresses.includes(addr) && !this.nodeList.blackListed.includes(addr)){
                  this.nodeList.addNewAddress(addr)
                }
              })
            }
          })

          peer.on('blockchainStatus', async (status)=>{
            // logger(`Received blockchain status from peer ${address}`);
            // console.log(status)
            if(!this.isDownloading){
              let updated = await this.receiveBlockchainStatus(peer, status)
              this.isDownloading = false
            }
          })

          peer.on('disconnect', () =>{
            logger(`connection with peer ${address} dropped`);
            delete this.connectionsToPeers[address];
            // this.seekOtherPeers()
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
      this.isDownloading = true;
      let length = lastHeader.blockNumber + 1;
      const closeConnection = () =>{
        peer.off('nextBlock')
        this.isDownloading = false;
      }
      if(this.chain.getLatestBlock().blockNumber == 0){
        
        let genesisBlock = await this.downloadGenesisBlock(peer)
        if(genesisBlock.error){
          logger(genesisBlock.error)
          closeConnection()
        }
        //Need to Validate Genesis Block
        this.chain[0] = genesisBlock
        let downloaded = await this.downloadBlockchain(peer, lastHeader)
        if(downloaded.error){
          closeConnection()
          resolve(
            { 
              error:{
                message:'Blockchain download failed',
                reason:downloaded.error
              } 
            })
        }
      }else{
        
  
        peer.on('nextBlock', async (block)=>{
          
          if(block.end){
            logger('Blockchain updated successfully!')
            closeConnection()
            resolve(true)
          }else if(block.error){
            logger(block.error)
            closeConnection()
            resolve({error:block.error})
          }else{
            if(block.previousHash != lastHash){
              let isBlockPushed = await this.chain.pushBlock(block);
              if(isBlockPushed.error){
                closeConnection()
                resolve({ error: 'Block could not be pushed' })
              }else{
                peer.emit('getNextBlock', block.hash)
              }
            }else{
              let isBlockFork = await this.chain.newBlockFork(block)
              peer.emit('getNextBlock', block.hash)
              closeConnection()
              resolve(true)
            }
            
          }
        })
      }
      peer.emit('getNextBlock', startHash);

    })
    
  }


  receiveBlockchainStatus(peer, status){
    return new Promise(async (resolve) =>{
      if(this.chain instanceof Blockchain && peer && status){
        
        let { totalDifficultyHex, bestBlockHeader, length } = status;
        
        if(totalDifficultyHex && bestBlockHeader && length){
          
          let thisTotalDifficultyHex = await this.chain.getTotalDifficulty();
          // Possible major bug, will not sync if chain is longer but has different block at a given height
          let totalDifficulty = BigInt(parseInt(totalDifficultyHex, 16))
          let thisTotalDifficulty =  BigInt(parseInt(thisTotalDifficultyHex, 16))

          if(thisTotalDifficulty < totalDifficulty){
            logger('Attempting to download blocks from peer')
            
            let isValidHeader = this.chain.validateBlockHeader(bestBlockHeader);
            if(isValidHeader && !this.isDownloading){
              
             let downloaded = await this.downloadBlockchain(peer, bestBlockHeader)
             if(downloaded.error){
               logger('Could not download blockchain')
               logger(downloaded.error)
               resolve(false)
             }else{
              resolve(true)
             }
            }else{
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
        logger('ERROR: Could not handle peer chain status. Missing parameter')
      }
    })
    
  }

  /**
    Broadcast only to this node's connected peers. Does not gossip
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
  */
  broadcast(eventType, data){
    try{
      if(this.connectionsToPeers){
          Object.keys(this.connectionsToPeers).forEach((peerAddress)=>{
            this.connectionsToPeers[peerAddress].emit(eventType, data);
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

  initChainInfoAPI(app){
    app.get('/getWalletBalance', async(req, res)=>{
      if(isValidWalletBalanceJSON(req.query)){
        let publicKey = req.query.publicKey;
        if(publicKey){
          let state = await this.chain.balance.getBalance(publicKey);
          res.json(state).end()
        }else{
          res.json({error:'ERROR: must provide publicKey'}).end()
        }
      }else{
        res.json({error:'ERROR: Invalid JSON request parameters'}).end()
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
      if(this.chain instanceof Blockchain && blockNumber){
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
      if(this.chain instanceof Blockchain && blockNumber){
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
  */
  initHTTPAPI(app){
    try{

      let rateLimiter = new RateLimit({
        windowMs: 1000, // 1 hour window 
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

      app.get('connect', (req, res)=>{
        //
      })
      
      app.get('/transaction', (req, res)=>{
        let tx = {};
        let pendingTx = {};
        let hash = req.query.hash;
        
        if(hash){
          tx = this.chain.getTransactionFromChain(hash);
          if(tx){
            res.json(tx).end()
          }else{

            pendingTx = Mempool.getTransactionFromPool(hash);
            
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
          if(isValidTransactionJSON(req.body)){
            let transaction = req.body
            
            this.broadcastNewTransaction(transaction)
            .then((transactionEmitted)=>{
              
              if(transactionEmitted.error){
                res.send(transactionEmitted.error)
              }else{
                let receipt = JSON.stringify(transaction, null, 2)
                res.send(receipt);
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
            
            this.broadcastNewAction(action)
            .then((actionEmitted)=>{
              if(!actionEmitted.error){
                res.send(JSON.stringify(actionEmitted, null, 2));
              }else{
                res.send(actionEmitted.error)
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

     socket.on('connectionRequest', async({address})=>{
       await rateLimiter.consume(socket.handshake.address).catch(e => {  console.log("Peer sent too many 'connectionRequest' events") }); // consume 1 point per event from IP
       this.connectToPeer(address);
     });

     socket.on('peerMessage', async(peerMessage)=>{
      if(!this.messageBuffer[peerMessage.messageId]){
        await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'peerMessage' events") }); // consume 1 point per event from IP
        this.handlePeerMessage(peerMessage);
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
      // logger(`Peer ${peerAddress} has requesting blockchain status`)
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
          }else{
            logger('ERROR: Could not find peer socket to download blockchain')
          }
          
          
          // console.log('Sending status :', status)
          
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

     socket.on('getGenesisBlock', async ()=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { 
        // console.log("Peer sent too many 'getNextBlock' events") 
      }); // consume 1 point per event from IP
       let genesisBlock = this.chain.chain[0];
       let transactions = await this.chain.chainDB.get(genesisBlock.hash)
            .catch(e => console.log(e))
          if(transactions){
            transactions = transactions[transactions._id]
            genesisBlock.transactions = transactions;
            socket.emit('genesisBlock', genesisBlock)
          }else{
            socket.emit('genesisBlock', {error:'Could not find transactions'})
          }
          
       
     })

    socket.on('getNextBlock', async (hash)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { 
        // console.log("Peer sent too many 'getNextBlock' events") 
      }); // consume 1 point per event from IP
      let index = this.chain.getIndexOfBlockHash(hash)
      
      if(index || index === 0){
        if(hash == this.chain.getLatestBlock().hash){
          socket.emit('nextBlock', {end:'End of blockchain'})
        }else{
          let nextBlock = this.chain.extractHeader(this.chain.chain[index + 1]);
          let transactions = await this.chain.chainDB.get(nextBlock.hash)
            .catch(e => console.log(e))
            if(transactions){
              transactions = transactions[transactions._id]
              nextBlock.transactions = transactions;
              socket.emit('nextBlock', nextBlock)
            }else{
              socket.emit('nextBlock', {error:'Could not find transactions'})
            }
          
        }
        
      }else{
        socket.emit('nextBlock', {error:'Block not found'})
      }
    })

     socket.on('getBlockFromHash', async(hash)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockFromHash' events") }); // consume 1 point per event from IP
      if(this.chain instanceof Blockchain){
        if(hash && typeof hash == 'string'){
         
          let blockIndex = this.chain.getIndexOfBlockHash(hash);
          if(blockIndex){
            let block = await this.chain.extractHeader(this.chain.chain[blockIndex]);
            if(block){
              let transactions = await this.chain.chainDB.get(hash)
              .catch(e => console.log(e))
              if(transactions){
                transactions = transactions[transactions._id]
                block.transactions = transactions;
              }else{
                socket.emit('blockFromHash', {error:'Could not find transactions'})
              }
              socket.emit('blockFromHash', block)
              
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


  /**
    Socket listeners only usable by external UIs and APIs
    @param {object} $socket - Client socket connection to this node's server
  */
  externalEventHandlers(socket){
    try{
      this.userInterfaces.push(socket)

      socket.on('error', (err)=>{
        logger(chalk.red(err));
      })

      socket.on('connectionRequest', (address)=>{
        this.connectToPeer(address, (peer)=>{});
      });

      socket.on('peerCheckout', ()=>{
        console.log(Object.keys(this.peersConnected))
        console.log(Object.keys(this.connectionsToPeers))

        console.log(this.peersConnected)
        console.log(this.connectionsToPeers)
      })

      socket.on('getBlockchain', ()=>{
        socket.emit('blockchain', this.chain);
      })

      socket.on('getAddress', (address)=>{
        this.requestKnownPeers(address);
      })

      socket.on('getKnownPeers', ()=>{
        
        logger(this.nodeList.addresses)
        socket.emit('knownPeers', this.nodeList.addresses);
      })

      socket.on('getInfo', ()=>{
        socket.emit('chainInfo', this.getChainInfo());
      })

      socket.on('getBlockHeader', (blockNumber)=>{
        let block = this.chain.chain[blockNumber];
        let blockInfo = {}
        if(block){
          
          blockInfo = {
            blockNumber:block.blockNumber,
            timestamp:block.timestamp,
            previousHash:block.previousHash,
            hash:block.hash,
            merkleRoot:block.merkleRoot,
            nonce:block.nonce,
            valid:block.valid,
            minedBy:block.minedBy,
            challenge:block.challenge,
            totalChallenge:block.totalChallenge,
            startMineTime:block.startMineTime,
            endMineTime:block.endMineTime,
            totalSumTransited:block.totalSumTransited,
            coinbaseTransactionHash:block.coinbaseTransactionHash
          }

          console.log(blockInfo)
        }else{
          blockInfo = {
            error: 'header not found'
          }
        }
        socket.emit('header', blockInfo)
      })

      socket.on('getBlock', async(blockNumber)=>{
        let hasBlock = this.chain.chain[blockNumber]
        if(isValidBlockJSON(hasBlock)){
          let block = this.chain.extractHeader(this.chain.chain[blockNumber])
          let transactions = await this.chain.chainDB.get(block.hash)
            .catch(e => console.log(e))
            transactions = transactions[transactions._id]
          block.transactions = transactions
          socket.emit('block', block)
        }else{
          socket.emit('block', {error:'ERROR: Block not found'})
        }
        
      })

      socket.on('startMiner', ()=>{
        this.minerStarted = true;
        this.createMiner()
      })

      socket.on('stopMining', ()=>{
        logger('Mining stopped')
        this.UILog('Mining stopped')
        console.log(this.connectionsToPeers)
        if(process.ACTIVE_MINER){
          
          process.ACTIVE_MINER.send({abort:true});
          
        }
      })

      socket.on('isChainValid', ()=>{
        let isValidChain = this.validateBlockchain();
        if(isValidChain){
          logger('Blockchain is valid')
        }
      })

      socket.on('showBalances', ()=>{
        console.log(this.chain.balance)
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

      socket.on('getMempool', ()=>{
        socket.emit('mempool', Mempool);
      })

      socket.on('requestPeers', ()=>{
        this.findPeers()
      })
      
      socket.on('test', async()=>{
        const LoopyLoop = require('loopyloop')
        const hexToBin = require('hex-to-binary')

        let chain = []

        const mineBlock = async (blockToMine) =>{
          let block = blockToMine;
            block.startMineTime = Date.now()
            let miner =  new LoopyLoop(async () => {
              
              if(isValidProof(block, block.challenge)){
                miner.stop()
                block.endMineTime = Date.now()
                block.timediff = (block.endMineTime - block.startMineTime);
                return block
              }else{
                block.nonce = (Math.pow(2, 64) * Math.random())
                // block.nonce++
              }
            })
        
            return miner
        }
        const calculateHash = (block) =>{
          return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce + block.actionMerkleRoot)
        }
        const isValidProof = (block, target) =>{
          
          block.hash = calculateHash(block)
          if(BigInt(parseInt(block.hash, 16)) <= BigInt(parseInt(target, 16))){
            return true
          }else{
            
            return false
          }
        }

        function pad(n, width, z) {
          z = z || '0';
          n = n + '';
          let array = (new Array(width - n.length + 1)).join(z)
          return n.length >= width ? n :  '0x'+array + n;
        }
        
        const setChallenge = (difficulty) =>{
          if(difficulty == 0n) difficulty = 1n
          let newChallenge = BigInt(Math.pow(2, 256) -1) / BigInt(difficulty)
          return newChallenge.toString(16);
        }

        function setNewDifficulty(previousBlock, newBlock){
          const mineTime = (newBlock.timestamp - previousBlock.timestamp) / 1000;
          let adjustment = 1;
          if(mineTime <= 0.2){
            adjustment = 10
          }else if(mineTime > 0.2 && mineTime <= 1){
            adjustment = 2
          }else if(mineTime > 1 && mineTime <= 10){
            adjustment = 1
          }else if(mineTime > 10 && mineTime <= 20){
            adjustment = 0;
          }else if(mineTime > 20 && mineTime <= 30){
            adjustment = 0
          }else if(mineTime > 30 && mineTime <= 40){
            adjustment = -1
          }else if(mineTime > 40 && mineTime <= 60){
            adjustment = -2
          }else if(mineTime > 60){
            adjustment = -10
          }
          
          let difficultyBomb = BigInt(Math.floor(Math.pow(2, Math.floor((chain.length / 10000)-2))))
          let modifier = Math.max(1 - Math.floor(mineTime / 10), -99)
          let newDifficulty = BigInt(previousBlock.difficulty) + BigInt(previousBlock.difficulty / 32n) * BigInt(adjustment) + BigInt(difficultyBomb)
          console.log('* Adjustment : ', adjustment)
          console.log('* New difficulty value : ', BigInt(previousBlock.difficulty))
          console.log('* To be added : ', BigInt(previousBlock.difficulty / 32n) * BigInt(modifier))
          console.log('* Otherwise: : ', BigInt(previousBlock.difficulty / 32n) * BigInt(adjustment))
          console.log('* Difficulty bomb:', BigInt(difficultyBomb))
          return newDifficulty;
        }

        function pad(n, width, z) {
          z = z || '0';
          n = n + '';
          return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
        }
        
        const startMine = async (previousBlock) =>{
          
          let randomIndex = Math.floor(Math.random() * this.chain.chain.length)
          let blockToConvert = this.chain.chain[randomIndex];
          let header = this.chain.extractHeader(blockToConvert)
          let block = header;//119647558363
          block.timestamp = Date.now()
          delete block.hash;
          if(!previousBlock){
            
            block.difficulty = BigInt(parseInt('0x16F0F0', 16));
            
            block.challenge = setChallenge(block.difficulty)
          }else{
            block.difficulty = setNewDifficulty(previousBlock, block)
            block.challenge = setChallenge(block.difficulty)
          }
          block.hash = '';
          block.nonce = 0;
          
          if(block){
            let mine = await mineBlock(block, block.difficulty)
            mine
                .on('started', () => {
                  
                })
                .on('stopped', async () => {
                  console.log('************************')
                  console.log(`* Test number ${ chain.length } `);
                  console.log(`* Difficulty ${block.difficulty} took approx. ${ block.timediff /1000 } seconds`);
                  console.log('* Hash:', block.hash)
                  console.log('* Nonce:', block.nonce)
                  console.log('* Challenge', block.challenge)
                  chain.push(block)
                  if(chain.length <= 200){ startMine(block) }
                  else{
                    let median = 0;
                    chain.forEach(block=>{
                      median += block.timediff;

                    })
                    console.log('The average block time is :', median/chain.length)
                  }
                })
                .on('error', (err) => {
                  console.log(err)
                })
                .start()
          }else{
            console.log('Missing params')
          }
          
        }

        startMine()
        
        
      })

      socket.on('rollback', async (number)=>{
        logger('Rolled back to block ', number)
        let endBlock = this.chain.chain.length-1
        let blocks = []
        for(var i=endBlock; i > number; i--){
          let block = this.chain.chain.pop()
          var blockTx = await this.chain.chainDB.get(block.hash).catch(e => console.log(e))
          let deleted = await this.chain.chainDB.remove(blockTx._id, blockTx._rev).catch(e => console.log(e))
          
          blocks.unshift(block)
          
        }
        console.log(`Removed ${blocks.length} blocks`)
      })

      socket.on('disconnect', ()=>{
        var index = this.userInterfaces.length
        this.userInterfaces.splice(index-1, 1)
      })
    }catch(e){
      console.log(e);
    }
    
  }

  minerConnector(){
    //Listen port 3000
    let app = express().listen(parseInt(this.port)+2000, '127.0.0.1');
    this.minerServer = socketIo(app);
    logger('Miner connector listening on ',parseInt(this.port)+2000)
    this.minerServer.on('connection',(socket)=>{

      logger('Miner connected!')
      this.minerServer.socket = socket

      this.minerServer.socket.emit('latestBlock', this.chain.getLatestBlock())

      this.minerServer.socket.on('newBlock', async (block)=>{
        if(block){
          let synced = await this.chain.pushBlock(block);
          if(synced.error){
            logger(synced.error)
  
          }else{
            if(synced.fork){
              logger(synced.fork)
            }
            this.sendPeerMessage('newBlockFound', block);
            this.minerServer.socket.emit('latestBlock', this.chain.getLatestBlock())
            
          }
        }else{
          logger('ERROR: New mined block is undefined')
        }
      })
  
      this.minerServer.socket.on('getLatestBlock', ()=>{
        if(this.chain instanceof Blockchain){
          this.minerServer.socket.emit('latestBlock', this.chain.getLatestBlock())
        }else{
          this.minerServer.socket.emit('error', {error: 'Chain is not ready'})
        }
      })

      this.minerServer.socket.on('getTxHashList', ()=>{
        this.minerServer.socket.emit('txHashList', Object.keys(Mempool.pendingTransactions))
      })

      this.minerServer.socket.on('getActionHashList', ()=>{
        this.minerServer.socket.emit('actionHashList', Object.keys(Mempool.pendingActions))
      })

      this.minerServer.socket.on('getTx', (hash)=>{
        this.minerServer.socket.emit('tx', Mempool.pendingTransactions[hash])
      })

      this.minerServer.socket.on('getAction', (hash)=>{
        this.minerServer.socket.emit('action', Mempool.pendingActions[hash])
      })

      this.externalEventHandlers(this.minerServer.socket)
  
    })
   
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
  async handlePeerMessage({ type, originAddress, messageId, data, relayPeer }){
    
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

          switch(type){
            case 'transaction':
              var transaction = JSON.parse(data);
              this.receiveTransaction(transaction);
              break;
            case 'action':
              let action = JSON.parse(data);
              this.receiveAction(action);
              break
            case 'newBlockFound':
              let added = await this.handleNewBlockFound(data);
              if(added.error){
                logger(added.error);
              }
              break;
            
          }
          
          this.broadcast('peerMessage', peerMessage)
        
      }catch(e){
        console.log(e)
      }  
    }
    
  }

  receiveTransaction(transaction){
    if(transaction && this.chain instanceof Blockchain){
      if(isValidTransactionJSON(transaction)){

        this.chain.validateTransaction(transaction)
        .then(valid => {
          if(!valid.error){
            Mempool.addTransaction(transaction);
            this.UILog('<-'+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(this.verbose) logger(chalk.green('<-')+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
          }else{
            this.UILog('!!!'+' Received invalid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(this.verbose) logger(chalk.red('!!!'+' Received invalid transaction : ')+ transaction.hash.substr(0, 15)+"...")
            Mempool.rejectedTransactions[transaction.hash] = transaction;
            logger(valid.error)
          }
        })
        

      }
    }
  }

  receiveAction(action){
    if(action && isValidActionJSON(action)){
      //Check if is owner of contract or has permission
      let account = this.accountTable.getAccount(action.fromAccount.name)
      this.chain.validateAction(action, account)
      .then(isValid =>{
        if(isValid){
          //Action will be added to Mempool only is valid and if corresponds with contract call
          
          
          let mapsToContractCall = this.handleAction(action);
          if(mapsToContractCall){
            //Execution success message
            //Need to avoid executing call on everynode simultaneously 
            //Also need to avoid any security breach when signing actions
            if(this.verbose) logger(chalk.yellow('«-')+' Received valid action : '+ action.hash.substr(0, 15)+"...")
          
          }
        }else{
          logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
        }
        
      })
    }
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

  handleNewBlockFound(data){
    return new Promise( async (resolve)=>{
      if(this.chain instanceof Blockchain && data){
        if(!this.isDownloading){
          try{

            let block = JSON.parse(data);
            let alreadyReceived = this.chain.getIndexOfBlockHash(block.hash)
            let alreadyIsInActiveFork = this.chain.blockForks[block.hash];
  
            if(!alreadyReceived && !alreadyIsInActiveFork){
              //Need to validate more before stopping miner
              if(this.chain.validateBlockHeader(block)){
  
                if(this.minerServer && this.minerServer.socket){
                  this.minerServer.socket.emit('stopMining')
                }
  
                let addedToChain = await this.chain.pushBlock(block);
                if(addedToChain.error){
                  resolve({error:addedToChain.error})
                }
  
                // if(addedToChain.outOfSync){
                //   this.selfCorrectDeepFork(peerSocket, blockForkIndex)
                // }
  
                // if(addedToChain.fork){
                //   let display = JSON.stringify(addedToChain.fork, null, 2)
                //   console.log(display)
                //   resolve(addedToChain.fork)
                // }
  
                // if(addedToChain.resolved){
                //   resolve(addedToChain.resolved);
                // }
  
                if(this.minerServer && this.minerServer.socket){
                  this.minerServer.socket.emit('latestBlock', this.chain.getLatestBlock())
                }
                
                resolve(true);

              }else{
                resolve({error:'ERROR:New block header is invalid'})
              }
            }
          }catch(e){
            console.log(e);
            resolve({error:e})
          }
        }else{
          //Need to store while downloading. Then, when done, validate them one by one
          this.blocksToValidate.push(data);
        }
      }else{
        resolve({error:'ERROR: Missing parameters'})
      }
    })
    
  }


  validateBlockchain(allowRollback){
    if(this.chain instanceof Blockchain){
      let isValid = this.chain.isChainValid();
      if(isValid.conflict){
        let atBlockNumber = isValid.conflict;
        if(allowRollback){
          this.rollBackBlocks(atBlockNumber-1);
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
    @desc Emits all transactions as peerMessages.
    @param {string} $sender - Sender of coins's Public key
    @param {string} $receiver - Receiver of coins's Public key
    @param {number} $amount - Amount of coins to send. Optional IF blockbase query
    @param {object} $data - data to send along with transaction
  */
  async broadcastNewTransaction(transaction){
    return new Promise( async (resolve, reject)=>{
      try{
          if(this.chain instanceof Blockchain){
            if(!transaction.signature){
              logger('Transaction signature failed. Missing signature')
              resolve({error:'Transaction signature failed. Missing signature'})
              
            }else{
              
              this.chain.createTransaction(transaction)
                .then( valid =>{
                  if(!valid.error){
  
        
                    Mempool.addTransaction(transaction);
                    this.UILog('Emitted transaction: '+ transaction.hash.substr(0, 15)+"...")
                    if(this.verbose) logger(chalk.blue('->')+' Emitted transaction: '+ transaction.hash.substr(0, 15)+"...")
                    
                    this.sendPeerMessage('transaction', JSON.stringify(transaction, null, 2)); //Propagate transaction
                    resolve(transaction)
  
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

  handleAction(action){
    switch(action.type){
      case 'account':
        if(action.task == 'create'){
          this.accountTable.addAccount(action.data);
        }
        break;
      case 'getValue':
        this.executeAction(action)
        break;
      case 'setValue':
        this.executeAction(action)
        break;
      default:
        logger('ERROR: Invalid contract call')
        return false;
    }
    Mempool.addAction(action)
    return true;
  }

  executeAction(action){
    //To be implemented
  }

  broadcastNewAction(action){
    return new Promise((resolve, reject)=>{
      try{

        let linkedAccount = this.accountTable.getAccount(action.fromAccount.name);

        if(!action.signature){
          logger('ERROR: Action could not be emitted. Missing signature')
          resolve({error:'Action could not be emitted. Missing signature'})
        }else{

          if(action.type == 'account' && action.task == 'create' && linkedAccount ){
            resolve({error:"Account already exists"});
            
          }else{
            this.chain.validateAction(action, linkedAccount)
            .then(valid=>{
              if(valid && !valid.error){
                let mapsToContractCall = this.handleAction(action);
                if(mapsToContractCall){
                  //Execution success message
                  //Need to avoid executing call on everynode simultaneously 
                  //Also need to avoid any security breach when signing actions
                  if(this.verbose) logger(chalk.cyan('-»')+' Emitted action: '+ action.hash.substr(0, 15)+"...")
                  this.sendPeerMessage('action', JSON.stringify(action, null, 2)); //Propagate transaction
                }
                
                resolve(action)
              }else{
                logger('ERROR: Action is invalid')
                resolve({error:valid.error})
              }
            })
          }
          
        }
        
        
        
      }catch(e){
        console.log(e)
      }
    })
  }

  // generateWalletCreationReceipt(wallet){
  //   const receipt = 
  //   `Created New Wallet!
  //    Wallet Name: ${wallet.name}
  //    Public key:${wallet.publicKey}
  //    Wallet id: ${wallet.id}
  //    Keep your password hash safe!`;

  //    return receipt;
  // }

  forceMine(){
    logger('Starting miner!')
    this.outputToUI('Starting miner!')
    this.startMiner();
  }

  /**
    @desc Miner loop can be launched via the web UI or upon Node boot up
  */
  createMiner(){
    if(this.chain instanceof Blockchain && this.minerStarted){

      this.miner = new Miner({
        chain:this.chain,
        address:this.address,
        publicKey:this.publicKey,
        verbose:this.verbose,
      })

      this.miner.start((block)=>{
        if(block){
          let newHeader = this.chain.getBlockHeader(block.blockNumber);
          this.sendPeerMessage('newBlockFound', newHeader);
          this.createMiner();
        }
        
      });
    }else{
      logger('ERROR: Could not start miner')
    }
  }

  pauseMiner(state){
    if(this.miner && typeof state == 'boolean'){
      this.miner.minerPaused = state;
    }
  }


  cashInCoinbaseTransactions(){
    return new Promise((resolve, reject)=>{
      if(Mempool.pendingCoinbaseTransactions){
        let hashes = Object.keys(Mempool.pendingCoinbaseTransactions);
        
        hashes.forEach( async(hash) =>{
          let transaction = Mempool.pendingCoinbaseTransactions[hash];
          
            if(transaction){
              let readyToMove = await this.chain.validateCoinbaseTransaction(transaction);
              
              if(readyToMove && !readyToMove.error && !readyToMove.pending){
                
                Mempool.moveCoinbaseTransactionToPool(transaction.hash);
                this.sendPeerMessage('transaction',transaction);
                resolve(true);
                
              }else{
                if(readyToMove.error){
                  logger('Rejected Transaction:', transaction.hash)
                  logger(readyToMove.error);
                  Mempool.rejectCoinbaseTransaction(transaction.hash);

                }else if(readyToMove.pending){
                  //Do nothing
                }
              }
                
              
            }else{
              logger('ERROR: coinbase transaction not found');
              resolve({error:'ERROR: coinbase transaction not found'})
            }
           
        })
        
      }
    })
  
  }

  save(){
    return new Promise(async (resolve, reject)=>{
      try{
        let savedBlockchain = await this.chain.saveBlockchain();
        let savedNodeList = await this.nodeList.saveNodeList();
        let savedMempool = await Mempool.saveMempool();
        let savedWalletManager = await this.walletManager.saveState();
        let savedNodeConfig = await this.saveNodeConfig();
        let savedAccountTable = await this.accountTable.saveTable();
        if(
            savedBlockchain 
            && savedNodeList 
            && savedMempool
            && savedWalletManager
            && savedNodeConfig
            && savedAccountTable
          )
          {
            resolve(true)
          }else{
            reject('ERROR: Could not save all files')
          }
        
      }catch(e){
        reject(e)
      }
      
    })
    
    
    
  }


  async loadNodeConfig(){
    fs.exists('./config/nodeconfig.json', async (exists)=>{
      if(exists){
        let nodeConfigString = await readFile('./config/nodeconfig.json');
        try{
          if(nodeConfigString){
            let nodeConfig = JSON.parse(nodeConfigString);
            this.address = nodeConfig.address;
            this.port = nodeConfig.port;
            this.id = nodeConfig.id;
            this.publicKey = nodeConfig.publicKey;
            // this.accountTable = nodeConfig.accountTable;
            logger('Loaded node config')
          }
          
        }catch(e){
          logger(e)
        }
      }else{
        this.saveNodeConfig();
      }
    })
  }

  async saveNodeConfig(){
    return new Promise(async (resolve, reject)=>{
      let config = {
        address:this.address,
        port:this.port,
        id:this.id,
        publicKey:this.publicKey,
        verbose:this.verbose,
        fastSync:this.fastSync
      }
  
      let saved = await writeToFile(JSON.stringify(config, null, 2),'./config/nodeconfig.json');
      if(saved){
        logger('Saved node config')
        resolve(true)
      }else{
        reject('ERROR: Could not save node config')
      }
      
    })
    
  }

  /**
    @desc Periodically clears out peer messages to avoid overflow
  */
  cleanMessageBuffer(){
    var that = this;
    setInterval(()=>{
      that.messageBuffer = {};
    }, 30000)
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
