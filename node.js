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
const { initBlockchain } = require('./backend/tools/blockchainHandler.js');
const Wallet = require('./backend/classes/wallet');
const Block = require('./backend/classes/block');
const Blockchain = require('./backend/classes/blockchain');
const Transaction = require('./backend/classes/transaction');
const NodeList = require('./backend/classes/nodelist');
const WalletManager = require('./backend/classes/walletManager');
const AccountCreator = require('./backend/classes/accountCreator');
const AccountTable = require('./backend/classes/accountTable');
const Miner = require('./backend/classes/miner')
/*************Smart Contract VM************** */
const callRemoteVM = require('./backend/contracts/build/callRemoteVM')
/**************Live instances******************/
const Mempool = require('./backend/classes/mempool'); //Instance not class


/****************Tools*************************/
const { displayTime, displayDate, logger, writeToFile, readFile, isHashPartOfMerkleTree } = require('./backend/tools/utils');
const {
  isValidTransactionJSON,
  isValidChainLengthJSON,
  isValidWalletRequestJSON,
  isValidGetNextBlockJSON,
  isValidHeaderJSON,
  isValidCreateWalletJSON,
  isValidUnlockWalletJSON,
  isValidWalletBalanceJSON,
  isValidActionJSON,
  isValidBlockJSON
} = require('./backend/tools/jsonvalidator');
const sha256 = require('./backend/tools/sha256');
const ProgressBar = require('./backend/tools/ProgressBar')
const sha1 = require('sha1')
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
let Progress = require('pace');


/**
  Instanciates a blockchain node
  @constructor
  @param {string} $address - Peer Ip address
  @param {number} $port - Connection on port
*/

class Node {
  constructor(address, port, options){
    this.address = 'http://'+address+':'+port,
    this.port = port
    this.id = sha1(this.address);
    this.chain = {};
    this.blockFork = [];
    this.ioServer = {};
    this.publicKey = '';
    this.userInterfaces = [];
    this.peersConnected = {}; //From ioServer to ioClient
    this.connectionsToPeers = {}; //From ioClient to ioServer
    this.nodeList = new NodeList();
    this.minimumNumberOfPeers = 5
    this.autoUpdate = true;  
    this.messageBuffer = {};
    this.miner = {}
    this.verbose = false;
    this.walletManager = new WalletManager(this.address);
    this.accountCreator = new AccountCreator();
    this.accountTable = new AccountTable();
    this.longestChain = {
      length:0,
      peerAddress:'',
      totalChallenge:0,
    }
    this.isDownloading = false;

    if(options){

    }
    
  }


  /**
    P2P Server with two main APIs. A socket.io API for fast communication with connected peers
    and an HTTP Api for remote peer connections as well as routine tasks like updating blockchain.
  */
  startServer(app=express()){
    try{

      console.log(chalk.cyan('\n******************************************'))
      console.log(chalk.cyan('*')+' Starting node at '+this.address);
      console.log(chalk.cyan('******************************************\n'))
      // const expressWs = require('express-ws')(app);
      app.use(express.static(__dirname+'/views'));
      express.json({ limit: '300kb' })
      app.use(helmet())
      const server = http.createServer(app).listen(this.port);
      this.loadNodeConfig()
      this.initChainInfoAPI(app);
      this.initHTTPAPI(app);
      this.cleanMessageBuffer();
      this.ioServer = socketIo(server, {'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':false });
      
      //Loading blockchain from file
      initBlockchain()
        .then(chain => {
          if(chain){
            logger('Blockchain successfully loaded')
            this.chain = chain;

            //Loading transaction Mempool
            Mempool.loadMempool()
            .then((mempoolLoaded)=>{
              if(mempoolLoaded){
                logger('Loaded transaction mempool');
                logger('Number of transactions in pool: '+Mempool.sizeOfPool());
              }else{
                logger(chalk.red('ERROR: Could not load mempool'))
              }
            })

          }else{
            logger(chalk.red('ERROR: Could not init blockchain'))
          }
        })

      //Loading list of known peer addresses
      this.nodeList.loadNodeList()
        .then(loaded =>{
          if(loaded){
            logger('Loaded list of known nodes')
            logger('Number of known nodes:', this.nodeList.addresses.length)
          }else{
            logger(chalk.red('Could not load list of nodes'))
          }
        })

      this.accountTable.loadAllAccountsFromFile()
      .then(loaded =>{
        if(loaded){
          logger('Loaded account table');
        }else{
          logger(chalk.red('Could not load account table'))
        }
      })
      
    }catch(e){
      console.log(chalk.red(e));
    }

    this.ioServer.on('connection', (socket) => {
      if(socket){
         if(socket.handshake.query.token !== undefined){
             try{
               socket.on('message', (msg) => { logger('Client:', msg); });

               let peerToken = JSON.parse(socket.handshake.query.token);
               let peerAddress = peerToken.address;
               let peerPublicKey = peerToken.publicKey
               let peerChecksumObj = peerToken.checksum;

               if(peerChecksumObj){
                let peerTimestamp = peerChecksumObj.timestamp;
                let peerRandomOrder = peerChecksumObj.randomOrder;
                let peerChecksum = peerChecksumObj.checksum

                let isValid = this.validateChecksum(peerTimestamp, peerRandomOrder);
              
                if(isValid){
                  this.peersConnected[peerAddress] = socket;
                  this.nodeList.addNewAddress(peerAddress);
                  this.nodeEventHandlers(socket);
                }else{
                  socket.emit('message', 'Connected to local node');
                  this.externalEventHandlers(socket);
                }
               }
               
             }catch(e){
               console.log(chalk.red(e))
             }

         }else{
           socket.emit('message', 'Connected to local node')
           this.externalEventHandlers(socket);
         }
      }else{
        logger(chalk.red('ERROR: Could not create socket'))
      }

    });

    this.ioServer.on('disconnect', ()=>{ logger('a node has disconnected') })

    this.ioServer.on('error', (err) =>{ logger(chalk.red(err));  })
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
    if(Object.keys(this.connectionsToPeers).length > 0){
      logger('Requesting other peer addresses');
      this.serverBroadcast('getPeers');
    }else{
      this.joinPeers();
    }
  }

  getNumberOfConnectionsToPeers(){
    let connections = Object.keys(this.connectionsToPeers);
    return connections.length
  }

  seekOtherPeers(){
    let activePeersAddresses = this.getNumberOfConnectionsToPeers()
    if(activePeersAddresses.length < this.minimumNumberOfPeers){
      
    }
  }


  /**
    Basis for P2P connection
  */
  connectToPeer(address, callback){

    if(address && this.address !== address){
      if(!this.connectionsToPeers[address]){
        let connectionAttempts = 0;
        let peer;
        let timestamp = Date.now();
        let randomOrder = Math.random();
        let checksum = this.validateChecksum(timestamp, randomOrder)
        try{
          peer = ioClient(address, {
            'reconnection limit' : 1000,
            'max reconnection attempts' : 3,
            'pingInterval': 2000, 
            'pingTimeout': 10000,
            'query':
            {
              token: JSON.stringify({ 'address':this.address, 'publicKey':this.publicKey, 'checksum':{
                  timestamp:timestamp,
                  randomOrder:randomOrder,
                  checksum:checksum
                } 
              }),
              
            }
          });

          peer.heartbeatTimeout = 120000;

          logger('Requesting connection to '+ address+ ' ...');
          this.UILog('Requesting connection to '+ address+ ' ...');

          peer.on('connect_timeout', (timeout)=>{
            if(connectionAttempts >= 3) { 
              peer.destroy()
              delete this.connectionsToPeers[address];
            }else{
              connectionAttempts++;
            }
              
          })

          peer.on('error', (error)=>{
            console.log(error)
          })

          peer.on('connect', () =>{
            if(!this.connectionsToPeers[address]){

              logger(chalk.green('Connected to ', address))
              this.UILog('Connected to ', address+' at : '+ displayTime())
              peer.emit('message', 'Connection established by '+ this.address);
              peer.emit('connectionRequest', this.address);
              setTimeout(()=>{
                peer.emit('getBlockchainStatus')
              },1000);
              this.connectionsToPeers[address] = peer;
              this.nodeList.addNewAddress(address)
              
            }else{
              logger('Already connected to target node')
            }
          })

          peer.on('blockchainStatus', async (status)=>{
            if(!this.isDownloading){
              this.receiveBlockchainStatus(peer, status)
            }
            
          })

          peer.on('whisper', (whisper)=>{
            let { type, originAddress, messageId, data, relayPeer }  = whisper;
            this.handleWhisperMessage(type, originAddress, messageId, data, relayPeer);
          })

          peer.on('getAddr', ()=>{
            peer.emit('addr', this.nodeList.addresses);
          })

          peer.on('disconnect', () =>{
            logger('connection with peer dropped');
            
          })

          if(callback){
            callback(peer)
          }



        }catch(err){
          logger(err);
        }

      }else{
        logger('Already initiated peer connection')
      }

    }
  }

  
  requestChainHeaders(peer, length){
    return new Promise((resolve, reject)=>{
      if(this.chain instanceof Blockchain && peer && length){
        let lastBlockNumber = this.chain.getLatestBlock().blockNumber;
        let headers = [];
        this.isDownloading = true;
        let bar = Progress({
          total:length,
          finishMessage:'Fetched all block headers of blockchain!'
        })
        peer.on('blockHeader', async (header)=>{
          if(header){
            bar.op()
            try{
                if(header.end){

                  if(this.verbose) logger('Headers fully synced')
                  peer.off('blockHeader')
                  this.isDownloading = false;
                  bar = null;
                  resolve(headers)

                }else if(header.error){

                  logger(header.error)
                  peer.off('blockHeader')
                  this.isDownloading = false;
                  bar = null;
                  resolve(header.error)

                }else{
                  let alreadyInChain = await this.chain.getIndexOfBlockHash(header.hash);
                  if(!alreadyInChain){
                    let isValidHeader = this.chain.validateBlockHeader(header)
                    if(isValidHeader){
                      headers.push(header);
                      peer.emit('getBlockHeader', header.blockNumber+1)
                    }else{
                      logger('ERROR: Is not valid header')
                      peer.off('blockHeader')
                      this.isDownloading = false;
                      bar = null;
                      resolve({error:'ERROR: Is not valid header'})
                    }
                  }else{
                    //Insert sidechain creation and validation here
                  }
                }
            }catch(e){
              console.log(e)
              resolve(false)
            }
            
          }
         })
         
         let lastBlockNum = this.chain.getLatestBlock().blockNumber
         peer.emit('getBlockHeader', lastBlockNum+1)
        
      }
    })
  }
  
  downloadBlocks(peer, headers, length){
    return new Promise(async (resolve, reject)=>{
      if(peer && headers){

        this.isDownloading = true
        
        peer.on('block', (block)=>{
          if(block){
            try{
              if(block.end){
                logger('Blockchain updated');
                peer.off('block');
                this.isDownloading = false
                resolve(true)
              }else if(block.error){
                logger(block.error)
                peer.off('block');
                this.isDownloading = false
                resolve(block.error)
              }else{
                if(this.chain instanceof Blockchain){

                  let alreadyInChain = this.chain.getIndexOfBlockHash(block.hash)
                  if(!alreadyInChain){ 
                    
                    this.receiveBlock(block)
                    .then( blockAdded=>{
                      if(blockAdded.error){
                        logger(blockAdded.error);
                        resolve(blockAdded.error)
                      }

                      if(blockAdded){
                        peer.emit('getBlock', block.blockNumber+1);
                      }
                      
                    })
                    
                  }
                  
                }
              }
              
            }catch(e){
              console.log(e)
            }
            
          }
         })
         let lastBlockNum = this.chain.getLatestBlock().blockNumber
         peer.emit('getBlock', lastBlockNum+1);
      }
    })
  }

  receiveBlock(block){
    return new Promise(async (resolve, reject)=>{
      if(isValidBlockJSON(block)){
        
        if(!this.chain.getIndexOfBlockHash(block.hash)){
          let isSynced = await this.addNewBlock(block);
          if(isSynced){
            resolve(true)
          }else{
            //Sidechain goes here
            let blockForkState = await this.createBlockFork(block);
            if(blockForkState.forked){
              resolve(blockForkState.forked)
            }else if(blockForkState.resolved){
              resolve(true);
            }else{
              resolve(false);
            }
            
          }        
        }else{
          resolve(false)
        }
        
      }else{
        resolve(false)
      }
    })
    
  }

  createBlockFork(block){
    return new Promise(async (resolve) =>{
      if(block){
        if(this.chain.blockFork){
          let isResolvedFork = await this.resolveBlockFork(block);   
          resolve(isResolvedFork);
        }else{
          if(this.chain.getLatestBlock().previousHash == block.previousHash){
            this.chain.blockFork = block;
            logger(`Created block fork at number ${block.blockNumber}`);
            resolve({forked:block.blockNumber})
          }else{
            logger('Block fork does not match last current block');
            resolve(false)
          }
          
        }
      }
    })
   
  }

  resolveBlockFork(block){
    return new Promise(resolve =>{
      if(block){
        if(this.chain.blockFork.hash = block.previousHash){
          logger('Resolving block fork by switching to the forked block')
          let lastBlock = this.chain.chain.splice(-1, 1);
          this.unwrapBlock(lastBlock);
          let isBlockForkSynced = await this.addNewBlock(this.chain.blockFork);
          if(isBlockForkSynced){
            let isNewBlockSynced = await this.addNewBlock(block);
            if(isNewBlockSynced){
              logger('Successfully switched blockchain branch');
              resolve(true);
            }else{
              logger('Could not sync new block')
              resolve(false)
            }
          }else{
            logger('Could not sync forked block')
            resolve(false)
          }
    
        }else{
          logger('Block received does not match block fork')
          resolve(false)
        }
      }
    })
    
  }

  async receiveBlockchainStatus(peer, status){
    if(this.chain instanceof Blockchain && peer && status){
      let { totalChallenge, bestBlockHeader, length } = status;

      if(totalChallenge && bestBlockHeader && length){
        
        let thisTotalChallenge = await this.chain.calculateWorkDone();

        if(thisTotalChallenge < totalChallenge){
          logger('Attempting to download blocks from peer')
          
          let isValidHeader = this.chain.validateBlockHeader(bestBlockHeader);
          if(isValidHeader){
            
            this.requestChainHeaders(peer, length)
            .then( headers=>{
              if(headers){
                this.downloadBlocks(peer, headers, length)
                .then( finished=>{
                  if(finished.error){
                    logger(finished.error)
                  }
                })
              }else{
                logger('ERROR: Headers not found')
                this.isDownloading = false;
              }
            })
          }else{

            logger('ERROR: Last block header from peer is invalid')
            this.isDownloading = false;
          }
        }
      }else{
        logger('ERROR: Status object is missing parameters parameters')
        this.isDownloading = false;
      }
    }
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
  broadcast(eventType, data, moreData=false ){
    try{
      if(this.connectionsToPeers){
          Object.keys(this.connectionsToPeers).forEach((peerAddress)=>{
            if(!moreData){

                this.connectionsToPeers[peerAddress].emit(eventType, data);
            }else{
                this.connectionsToPeers[peerAddress].emit(eventType, data, moreData);
            }
          })
        }
    }catch(e){
      console.log(e);
    }

  }

  whisper(type, data, relayPeer){
    if(type){
      try{
        if(typeof data == 'object')
          data = JSON.stringify(data);
        var shaInput = (Math.random() * Date.now()).toString()
        var messageId = sha256(shaInput);
        this.messageBuffer[messageId] = messageId;
        this.serverBroadcast('whisper', { 
          'type':type, 
          'messageId':messageId, 
          'originAddress':this.address, 
          'data':data,
          'relayPeer':relayPeer
        });

      }catch(e){
        console.log(chalk.red(e));
      }

    }
  }

  handleWhisperMessage(type, originAddress, messageId, data, relayPeer){
    let gossipMessage = { 
      'type':type, 
      'originAddress':originAddress, 
      'messageId':messageId, 
      'data':data, 
      'relayPeer':relayPeer 
    }

    if(!this.messageBuffer[messageId]){
      switch(type){
        case 'blockchainStatus':
          try{
            let relayPeer = this.peersConnected[relayPeer];
            let status = JSON.parse(data)
            this.receiveBlockchainStatus(relayPeer, status)
          }catch(e){
            console.log(e)
          }
          
          break;
        case 'message':
          logger(data)
          break;
        default:
          break;
      }

        this.messageBuffer[messageId] = gossipMessage;
        this.whisper('gossip', gossipMessage, this.address)
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
          res.json({ 
            balance: 
            this.chain.getBalanceOfAddress(publicKey) 
            + this.chain.checkFundsThroughPendingTransactions(publicKey)
          }).end()
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

      
  
      app.post('/chainLength', (req, res) =>{
        try{
          if(isValidChainLengthJSON(req.body)){
            const { length, peerAddress, totalChallenge } = req.body;
            if(this.longestChain.length < length && this.nodeList.addresses.includes(peerAddress)){
              res.send('OK')
              this.longestChain.length = length;
              this.longestChain.peerAddress = peerAddress
              this.longestChain.totalChallenge = 
              logger(peerAddress+' has sent its chain length: '+length)
            }else{
              res.send('ERROR: failed to post chain length')
            }
          }
          
        }catch(e){
          logger(chalk.red("ERROR: Could not receive chainLength response", e.errno));
        }
      })

      app.get('/getChainHeaders', (req, res)=>{
  
        try{
            let chainHeaders = this.getAllHeaders(this.address);
            res.json({ chainHeaders:chainHeaders }).end()
  
        }catch(e){
          console.log(chalk.red(e));
        }
      })
  
      app.get('/getBlockHeader',(req, res)=>{
        var blockNumber = req.query.hash;
        if(blockNumber){
          res.json(this.chain.getBlockHeader(blockNumber)).end()
        }
      })

      // app.get('/getNextBlock', (req, res)=>{
        
      //   if(isValidGetNextBlockJSON(req.query)){
      //     try{
      //       var blockHash = req.query.hash;
      //       var blockHeader = JSON.parse(req.query.header);
      //       if(this.chain instanceof Blockchain && isValidHeaderJSON(blockHeader)){
      //         const indexOfCurrentPeerBlock = this.chain.getIndexOfBlockHash(blockHash);
      //         const lastBlock = this.chain.getLatestBlock();
      //         if(indexOfCurrentPeerBlock || indexOfCurrentPeerBlock === 0){
    
      //           var nextBlock = this.chain.chain[indexOfCurrentPeerBlock+1];
      //           if(nextBlock){
      //             res.json(nextBlock).end()
      //           }
      //           if(blockHash === lastBlock.hash){
      //             res.json( { error:'end of chain' } ).end()
      //           }
    
      //         }else{
    
      //           let lastBlockHeader = this.chain.getBlockHeader(lastBlock.blockNumber);
    
      //           if(blockHeader.blockNumber == lastBlock.blockNumber){
      //             if(blockHeader.blockNumber !== 0){
      //               res.json( { error:'block fork', header:JSON.stringify(lastBlockHeader) } ).end()
      //             }else{
      //               res.json( { error:'end of chain' } ).end()
      //             }
                  
      //           }else{
      //             res.json( { error:'no block found' } ).end()
      //           }
    
      //         }
      //       }else{
      //         res.json( { error:'invalid request parameters' } ).end()
      //       }
      //     }catch(e){
      //       console.log(chalk.red(e))
      //     }
      //   }else{
      //     res.json({ error: 'invalid block request JSON format' }) 
      //   }

      // })

    }catch(e){
      logger(e)
    }
    
  }


  /**
    Socket listeners only usable by server nodes
    @param {object} $socket - Client socket connection to this node's server
  */
  nodeEventHandlers(socket){
    if(socket){

     socket.on('error', (err)=>{
       logger(chalk.red(err));
     })

     socket.on('connectionRequest', (address)=>{
       this.connectToPeer(address, (peer)=>{
       });
     });

     socket.on('peerMessage', (data)=>{
       var { type, originAddress, messageId, data, relayPeer } = data
       this.handlePeerMessage(type, originAddress, messageId, data, relayPeer);
     })

     socket.on('gossipMessage', (data)=>{
      var { type, originAddress, messageId, data } = data
      this.handleGossipMessage(type, originAddress, messageId, data);
     })

     socket.on('directMessage', (data)=>{
      var { type, originAddress, targetAddress, messageId, data } = data
      this.handleDirectMessage(type, originAddress, targetAddress, messageId, data);
     });

     socket.on('disconnect', ()=>{
       if(socket.handshake.headers.host){
         var disconnectedAddress = 'http://'+socket.handshake.headers.host
         delete this.peersConnected[disconnectedAddress]
       }

     });

     socket.on('getBlockchainStatus', ()=>{
      if(this.chain instanceof Blockchain){
        try{
          let status = {
            totalChallenge: this.chain.calculateWorkDone(),
            bestBlockHeader: this.chain.getBlockHeader(this.chain.getLatestBlock().blockNumber),
            length: this.chain.chain.length
          }
          socket.emit('blockchainStatus', status);
         }catch(e){
           console.log(e)
         }
       }
        
     })

     socket.on('getBlockHeader', async (blockNumber)=>{
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

     socket.on('getBlock', (blockNumber)=>{
      if(this.chain instanceof Blockchain){
        if(blockNumber && typeof blockNumber == 'number'){
         
          let block = this.chain.chain[blockNumber];
          if(block){
            
            socket.emit('block', block)
            
          }else if(blockNumber == this.chain.getLatestBlock().blockNumber + 1){
            socket.emit('block', {end:'End of blockchain'})
          }else{
            socket.emit('block', {error:'Block not found'})
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

    this.userInterfaces.push(socket)

    socket.on('error', (err)=>{
      logger(chalk.red(err));
    })

    socket.on('connectionRequest', (address)=>{
      this.connectToPeer(address, (peer)=>{});
    });

    socket.on('getBlockchain', ()=>{
      socket.emit('blockchain', this.chain);
    })

    socket.on('getAddress', (address)=>{
      this.requestKnownPeers(address);
    })

    socket.on('getKnownPeers', ()=>{
      socket.emit('knownPeers', this.nodeList.addresses);
    })

    socket.on('getInfo', ()=>{
      socket.emit('chainInfo', this.getChainInfo());
    })

    socket.on('getBlock', (blockNumber)=>{
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
      }else{
        blockInfo = {
          error: 'block not found'
        }
      }
      socket.emit('block', blockInfo)
    })

    socket.on('getBlockSize', (number)=>{
      socket.emit('message', `Block number ${number-1} has ${Object.keys(this.chain.chain[number-1].transactions).length} transactions`)
    })

    socket.on('resolveInvalidChain', ()=>{
      this.validateBlockchain(true);
    })

    socket.on('startMiner', ()=>{
      this.createMiner()
    })

    socket.on('stopMining', ()=>{
      logger('Mining stopped')
      this.UILog('Mining stopped')
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

    socket.on('getMempool', ()=>{
      socket.emit('mempool', Mempool);
    })
    
    socket.on('test', ()=>{
      // let transactions = this.chain.chain[30].transactions;
      // let hashes = Object.keys(transactions);
      // let txToVerif = hashes[2];
      // isHashPartOfMerkleTree(txToVerif, transactions);
      let pace = new Progress()
      this.chain.chain.forEach( block=>{
        for(var i=0; i<10; i++){
          pace.op();
        }
        
      })
      pace = null;
    
      

    })

    socket.on('rollback', ()=>{
      logger('Rolled back to block 2319')
      this.rollBackBlocks(2319)
    })

    socket.on('dm', (address, message)=>{
      console.log(`Sending: ${message} to ${address}`)
      this.sendDirectMessage('message', address, message)
    })

    socket.on('sumFee', async (number)=>{
      console.log(this.chain.gatherMiningFees(this.chain.chain[number]))
    })

    socket.on('getAccounts', (ownerKey)=>{
      if(ownerKey){
        let accounts = this.accountTable.getAccountsOfKey(ownerKey)
        socket.emit('accounts', accounts)
      }else{
        socket.emit('accounts', this.accountTable.accounts)
      }
        
    })


    socket.on('deleteAccounts', async()=>{
      let w = new Wallet();
      w = await w.importWalletFromFile(`./wallets/8003-b5ac90fbdd1355438a65edd2fabe14e9fcca10ea.json`);
      let account = this.accountTable.accounts['kayusha'];
      console.log(w)
      let unlocked = await w.unlock(this.port)
      let signature = await w.sign(account.hash);
      console.log(signature)
      let deleted = await this.accountTable.deleteAccount('kayusha', signature);
      if(deleted){
        logger(`Account kayusha got deleted`);
      }else{
        logger('Could not delete kayusha')
      }
      
     })
	
    socket.on('txSize', (hash)=>{
      if(Mempool.pendingTransactions.hasOwnProperty(hash)){
        let tx = Mempool.pendingTransactions[hash];
        
        logger('Size:'+ (Transaction.getTransactionSize(tx) / 1024) + 'Kb');
        console.log(tx.miningFee)
        console.log(this.chain.calculateTransactionMiningFee(tx))
      }else{
        logger('No transaction found');
        socket.emit('message', 'No transaction found')
      }
      
    })

    socket.on('resolveFork', ()=>{
      if(this.longestChain.peerAddress){
        logger('Resolving fork!');
        this.resolveBlockFork(this.longestChain.peerAddress);
      }else{
        socket.emit('message', 'ERROR: longest chain is unknown')
      }
    })

    socket.on('disconnect', ()=>{
      var index = this.userInterfaces.length
      this.userInterfaces.splice(index-1, 1)
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

  sendDirectMessage(type, targetAddress, data){
    if(type){
      try{
        if(typeof data == 'object')
          data = JSON.stringify(data);
        var shaInput = (Math.random() * Date.now()).toString()
        var messageId = sha256(shaInput);
        this.messageBuffer[messageId] = messageId;
        
        this.broadcast('directMessage', { 
         'type':type,
         'originAddress':this.address, 
         'targetAddress':targetAddress, 
         'messageId':messageId, 
         'data':data 
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
  handlePeerMessage(type, originAddress, messageId, data, relayPeer){
    try{
      let peerMessage = { 
        'type':type, 
        'originAddress':originAddress, 
        'messageId':messageId, 
        'data':data,
        'relayPeer':relayPeer 
      }

      if(!this.messageBuffer[messageId]){
        switch(type){
          case 'transaction':
            if(data){
              var transaction = JSON.parse(data);
              this.receiveTransaction(transaction);
            }
            break;
          case 'action':
            let action = JSON.parse(data);
            this.receiveAction(action);
            break
          case 'newBlockFound':
            if(this.chain instanceof Blockchain && data){
              let header = JSON.parse(data);
              if(!this.chain.getIndexOfBlockHash(header.hash)){
                
                if(this.chain.validateBlockHeader(header)){
                  
                  this.pauseMiner(true)
                  
                  if(process.ACTIVE_MINER){
                    process.ACTIVE_MINER.send({abort:true});
                  }
  
                  let peerSocket = this.connectionsToPeers[relayPeer]
                  if(peerSocket){
                    this.downloadBlocks(peerSocket, [header], 1)
                    .then( downloaded=>{
                      if(downloaded){
  
                        this.sendPeerMessage('newBlockFound', header)
                        this.pauseMiner(false)

                      }else if(downloaded.error){
                        logger(downloaded.error)
                      }
                    })
                  }
                }
              }
            }
            break;
          case 'message':
            logger(chalk.green('['+originAddress+']')+' -> '+data)
            break;
        }
        this.messageBuffer[messageId] = peerMessage;
        this.broadcast('peerMessage', peerMessage)
        
      }
    }catch(e){
      console.log(e)
    }
  }

  handleDirectMessage(type, originAddress, targetAddress, messageId, data){
    let directMessage = { 
      'type':type, 
      'originAddress':originAddress, 
      'targetAddress':targetAddress, 
      'messageId':messageId, 
      'data':data 
    }
    if(!this.messageBuffer[messageId]){

      if(directMessage.originAddress == directMessage.targetAddress){
        return false;
      }

      if(this.address == directMessage.targetAddress){
        switch(type){
          case 'peerRequest':
          break;
          case 'accountRequest':
          break;
          case 'addressRequest':
          break;
          case 'chainLength':
            const length = data
            
            if(this.longestChain.length < length && this.nodeList.addresses.includes(originAddress)){
              
              this.longestChain.length = length;
              this.longestChain.peerAddress = originAddress
              logger(originAddress+' has sent its chain length: '+length)
            }
          break;
          case 'message':
              console.log(`!Received message from: ${originAddress}: ${data}`)
            break;
        }
      }else if(this.connectionsToPeers[targetAddress]){
        this.connectionsToPeers[targetAddress].emit('directMessage', directMessage)
      }else if(this.peersConnected[targetAddress]){
        this.peersConnected[targetAddress].emit('directMessage', directMessage)
      }else{
        this.messageBuffer[messageId] = directMessage;
        this.broadcast('directMessage', directMessage)
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
      lastBlockTime:displayDate(new Date(this.chain.getLatestBlock().endMineTime)),
      minedBy:this.chain.getLatestBlock().minedBy,
    }
    return info
  }

  /**
    Validates every block that gets added to blockchain.
    @param {Object} $newBlock - Block to be added
  */
  async addNewBlock(newBlock){
      if(isValidBlockJSON(newBlock)){ //typeof newBlock == 'object'
        
        var isBlockSynced = await this.chain.syncBlock(newBlock);
        if(isBlockSynced){
          Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
          logger(chalk.green('* Synced new block ')+newBlock.blockNumber+chalk.green(' with hash : ')+ newBlock.hash.substr(0, 25)+"...");
          logger(chalk.green('* Number of transactions: '), Object.keys(newBlock.transactions).length)
          logger(chalk.green('* By: '), newBlock.minedBy)
          return true;
        }else{
          return false;
        }
      }else{
        logger('ERROR: Block has invalid format');
        return false;
      }
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

   //could be moved to Blockchain.js
  compareHeaders(headers){
    // logger(headers)
    if(this.chain instanceof Blockchain){
      if(headers){
        for(var i=0; i < headers.length; i++){

          var header = headers[i]
          var localBlockHeader = this.chain.getBlockHeader(i);

          try{
            
            if(i > 1 && isValidHeaderJSON(header)){
              let isValid = this.chain.validateBlockHeader(header);
              let containsBlock = localBlockHeader.hash == header.hash;
              

              if(!containsBlock) {
                console.log('Does not contain block ',i)
                return i
              };
              if(!isValid){
                console.log('Is not valid ', i);
                console.log(sha256(header.previousHash + header.timestamp + header.merkleRoot + header.nonce))
                
                console.log('Block Hash:', block.hash);
                console.log('Header Hash',header.hash);
                console.log(sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce))
                
                console.log('Previous hash', header.previousHash);
                console.log('Timestamp', header.timestamp);
                console.log('Merkle', header.merkleRoot);
                console.log('Nonce', header.nonce)
                return false;
              }
              if(headers.length < this.chain.chain.length){
                logger('This chain is longer than peer chain')
                return false;
              } 
            }

          }catch(e){
            console.log(e)
          }


        }
        return true;
      }
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
      sideChain.forEach((block)=>{
        this.unwrapBlock(block);
        this.chain.orphanedBlocks.push(block)
      })

      return sideChain;
    }
  }

  resolveBlockFork(headers){
    if(headers){
      let areValidHeaders = this.compareHeaders(headers)

        if(areValidHeaders){
          if(typeof areValidHeaders == 'number'){

            var conflictIndex = areValidHeaders;
            var numberOfForkingBlocks = this.chain.chain.length - conflictIndex;

            logger('Conflicting block at index:', conflictIndex)
            logger('Num. of forking blocks',numberOfForkingBlocks);
            logger('Chain length:', this.chain.chain.length)

            for(var i=0;i<=numberOfForkingBlocks;i++ ){
              let orphanBlocks = this.chain.chain.pop();
              this.chain.orphanedBlocks.push(orphanBlocks);
            }

            this.update();
          }else{
            logger('Headers are of at least the same length')
          }
        }else{
          logger('Peer headers are not valid')
        }
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

  generateReceipt(sender, receiver, amount, data, signature, hash){
    const receipt = 
    `Transaction receipt:
    Sender: ${sender}
    Receiver: ${receiver}
    Amount: ${amount}
    Sent at: ${Date.now()}
    Signature: ${signature}
    Hash: ${hash}`

    return receipt
  }

  generateWalletCreationReceipt(wallet){
    const receipt = 
    `Created New Wallet!
     Wallet Name: ${wallet.name}
     Public key:${wallet.publicKey}
     Wallet id: ${wallet.id}
     Keep your password hash safe!`;

     return receipt;
  }

  forceMine(){
    logger('Starting miner!')
    this.outputToUI('Starting miner!')
    this.startMiner();
  }


  update(){
    this.gossip('getBlockchainStatus')
  }

  /**
    @desc Miner loop can be launched via the web UI or upon Node boot up
  */
  createMiner(){
    if(this.chain instanceof Blockchain){
      this.miner = new Miner({
        chain:this.chain,
        address:this.address,
        publicKey:this.publicKey,
        verbose:this.verbose,
      })

      this.miner.start((block)=>{
        let newHeader = this.chain.getBlockHeader(block.blockNumber);
        this.sendPeerMessage('newBlockFound', newHeader);

      });
    }
  }

  pauseMiner(state){
    if(this.miner && typeof state == 'boolean'){
      this.miner.minerPaused = state;
    }
  }

  unwrapBlock(block){
    if(isValidBlockJSON(block)){
      let transactionsOfCancelledBlock = block.transactions;
      let actionsOfCancelledBlock = block.actions
      Mempool.putbackPendingTransactions(transactionsOfCancelledBlock);
      Mempool.putbackPendingActions(actionsOfCancelledBlock)
      this.cashInCoinbaseTransactions();
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

  save(callback){
    
    this.chain.saveBlockchain()
      .then((saved)=>{
        
        this.nodeList.saveNodeList();
        Mempool.saveMempool();
        this.walletManager.saveState();
        this.saveNodeConfig()
        this.accountTable.saveTable();
        if(saved == true){
          logger('Saved blockchain file')
          if(callback) callback(true);
          return true;
        }else{
          logger(chalk.red('ERROR: could not write blockchain file'));
          if(callback) callback(false);
          return false;
        }
        
      })
      .catch((e)=>{
        console.log(chalk.red(e))
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
    let config = {
      address:this.address,
      port:this.port,
      id:this.id,
      publicKey:this.publicKey,
      // accountTable:this.accountTable,
    }

    let saved = await writeToFile(JSON.stringify(config, null, 2),'./config/nodeconfig.json');
    if(saved) logger('Saved node config')
  }

  /**
    @desc Periodically clears out peer messages to avoid overflow
  */
  cleanMessageBuffer(){
    var that = this;
    setInterval(()=>{
      that.messageBuffer = {};
      this.isDownloading = false; //In case it is stuck
      
    }, 30000)
  }

  UILog(message, arg){
    if(arg){
      this.outputToUI(message, arg)
    }else{
      this.outputToUI(message)
    }
  }

  async validateChecksum(timestamp, randomOrder){
    let nodeChecksum = '';
    let blockchainChecksum = '';
    let blockChecksum = '';
    let challengeChecksum = '';
    let transactionChecksum = '';

    let nodeFile = await readFile('./node.js');
    let blockchainFile = await readFile(`./backend/classes/blockchain.js`);
    let blockFile = await readFile(`./backend/classes/block.js`);
    let challengeFile = await readFile(`./backend/classes/challenge.js`);
    let transactionFile = await readFile(`./backend/classes/transaction.js`);

    if(nodeFile && blockchainFile && blockFile && challengeFile && transactionFile){
      nodeChecksum = await sha256(nodeFile)
      blockchainChecksum = await sha256(blockchainFile)
      blockChecksum = await sha256(blockFile)
      challengeChecksum = await sha256(challengeFile)
      transactionChecksum = await sha256(transactionFile);

      let checksumArray = [
        nodeChecksum,
        blockchainChecksum,
        blockChecksum,
        challengeChecksum,
        transactionChecksum
      ]
  
      checksumArray.sort((a, b)=>{
        return 0.5 - randomOrder;
      })
  
      let finalChecksum
      checksumArray.forEach( checksum=>{
        finalChecksum = finalChecksum + checksum;
      })
  
      finalChecksum = sha256(finalChecksum + timestamp.toString()) ;
      return finalChecksum;

    }else{
      return false;
    }
    
    

  }




}


module.exports = new Node()
