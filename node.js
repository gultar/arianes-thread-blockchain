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
const AccountTable = require('./backend/classes/accountTable')
/*************Smart Contract VM************** */
const callRemoteVM = require('./backend/contracts/build/callRemoteVM')
/**************Live instances******************/
const Mempool = require('./backend/classes/mempool'); //Instance not class


/****************Tools*************************/
const { displayTime, displayDate, logger, writeToFile, readFile } = require('./backend/tools/utils');
const {
  isValidTransactionJSON,
  isValidChainLengthJSON,
  isValidWalletRequestJSON,
  isValidGetNextBlockJSON,
  isValidHeaderJSON,
  isValidCreateWalletJSON,
  isValidUnlockWalletJSON,
  isValidWalletBalanceJSON,
  isValidActionJSON
} = require('./backend/tools/jsonvalidator')
const sha256 = require('./backend/tools/sha256');
const sha1 = require('sha1')
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');


/**
  Instanciates a blockchain node
  @constructor
  @param {string} $address - Peer Ip address
  @param {number} $port - Connection on port
*/

class Node {
  constructor(address, port){
    this.address = 'http://'+address+':'+port,
    this.port = port
    this.id = sha1(this.address);
    this.chain = {};
    this.ioServer = {};
    this.publicKey = '';
    this.userInterfaces = [];
    this.peersConnected = {};
    this.connectionsToPeers = {};
    this.nodeList = new NodeList();
    this.messageBuffer = {};
    this.minerStarted = false;
    this.minerPaused = false;
    this.verbose = false;
    this.walletManager = new WalletManager(this.address);
    this.accountCreator = new AccountCreator();
    this.accountTable = new AccountTable();
    this.longestChain = {
      length:0,
      peerAddress:''
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
      this.initHTTPAPI(app);
      this.connectToKeyServer()
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


  /**
    Basis for P2P connection
  */
  connectToPeer(address, callback){

    if(address && this.address !== address){
      if(this.connectionsToPeers[address] == undefined){
        let connectionAttempts = 0;
        let peer;
        let timestamp = Date.now();
        let randomOrder = Math.random();
        let checksum = this.validateChecksum(timestamp, randomOrder)
        try{
          peer = ioClient(address, {
            'reconnection limit' : 1000,
            'max reconnection attempts' : 3,
            'query':
            {
              token: JSON.stringify({ 'address':this.address, 'publicKey':this.publicKey, 'checksum':{
                timestamp:timestamp,
                randomOrder:randomOrder,
                checksum:checksum
              } }),
              
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
              logger('Connection attempt to address '+address+' timed out.\n'+(4 - connectionAttempts)+' attempts left');
              connectionAttempts++;
            }
              
          })

          peer.on('connect', () =>{
            if(!this.connectionsToPeers.hasOwnProperty(address)){

              logger(chalk.green('Connected to ', address))
              this.UILog('Connected to ', address+' at : '+ displayTime())
              peer.emit('message', 'Peer connection established by '+ this.address+' at : '+ displayTime());
              peer.emit('connectionRequest', this.address);
              this.sendPeerMessage('addressBroadcast');
              
              this.connectionsToPeers[address] = peer;
              this.nodeList.addNewAddress(address)
              
            }else{
              logger('Already connected to target node')
            }
          })

          peer.on('message', (message)=>{
              logger('Server: ' + message);
          })

          peer.on('getAddr', ()=>{
            peer.emit('addr', this.nodeList.addresses);
          })

          peer.on('disconnect', () =>{
            logger('connection with peer dropped');
            delete this.connectionsToPeers[address];
              
            
          })

          if(callback){
            callback(peer)
          }



        }catch(err){
          logger(err);
        }

      }else{
      }

    }
  }

  async connectToKeyServer(){
    let socket = await ioClient('http://localhost:3000', {
      'query':
            {
              token: JSON.stringify({ 'address':this.address, 'publicKey':this.publicKey })
            }
    });
    socket.on('connect', ()=>{
      logger('Connected to key server')
    })
    socket.on('message', message => console.log(message))
    socket.on('wallet', (wallet)=>{  })

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
      console.log(chalk.red(e));
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
    Internode API that can be used by UIs to get data from blockchain and send transactions
    @param {Object} $app - Express App
  */
  initHTTPAPI(app){
    try{
      
      let rateLimiter = new RateLimit({
        windowMs: 1000, // 1 hour window 
        max: 30, // start blocking after 100 requests 
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
                res.send(this.generateReceipt(
                  transaction.fromAddress, 
                  transaction.toAddress, 
                  transaction.amount, 
                  transaction.data, 
                  transaction.signature, 
                  transaction.hash));
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
  
      app.post('/chainLength', (req, res) =>{
        try{
          if(isValidChainLengthJSON(req.body)){
            const { length, peerAddress } = req.body;
            if(this.longestChain.length < length && this.nodeList.addresses.includes(peerAddress)){
              res.send('OK')
              this.longestChain.length = length;
              this.longestChain.peerAddress = peerAddress
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
            let chainHeaders = this.getAllHeaders();
            res.json({ chainHeaders:chainHeaders }).end()
  
        }catch(e){
          console.log(chalk.red(e));
        }
      })
  
      app.get('/getNextBlock', (req, res)=>{
        
        if(isValidGetNextBlockJSON(req.query)){
          try{
            var blockHash = req.query.hash;
            var blockHeader = JSON.parse(req.query.header);
    
            if(this.chain instanceof Blockchain && isValidHeaderJSON(blockHeader)){
              const indexOfCurrentPeerBlock = this.chain.getIndexOfBlockHash(blockHash);
              const lastBlock = this.chain.getLatestBlock();
              if(indexOfCurrentPeerBlock || indexOfCurrentPeerBlock === 0){
    
                var nextBlock = this.chain.chain[indexOfCurrentPeerBlock+1];
                if(nextBlock){
                  res.json(nextBlock).end()
                }
                if(blockHash === lastBlock.hash){
                  res.json( { error:'end of chain' } ).end()
                }
    
              }else{
    
                let lastBlockHeader = this.chain.getBlockHeader(lastBlock.blockNumber);
    
                if(blockHeader.blockNumber == lastBlock.blockNumber){
                  if(blockHeader.blockNumber !== 0){
                    res.json( { error:'block fork', header:JSON.stringify(lastBlockHeader) } ).end()
                  }else{
                    res.json( { error:'end of chain' } ).end()
                  }
                  
                }else{
                  res.json( { error:'no block found' } ).end()
                }
    
                
              }
            }else{
              res.json( { error:'invalid request parameters' } ).end()
            }
          }catch(e){
            console.log(chalk.red(e))
          }
        }else{
          res.json({ error: 'invalid block request JSON format' }) 
        }

      })

      app.get('/getInfo', (req, res)=>{
        res.json(this.getChainInfo()).end()
      })

      app.get('/getBlockHeader',(req, res)=>{
        var blockNumber = req.query.hash;
        if(blockNumber){
          res.json(this.chain.getBlockHeader(blockNumber)).end()
        }
      })

      // app.post('/createAccount', (req, res)=>{

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

     // Basis for gossip protocol on network
     socket.on('peerMessage', (data)=>{
       var { type, originAddress, messageId, data } = data
       this.handlePeerMessage(type, originAddress, messageId, data);
     })

     socket.on('directMessage', (data)=>{
      var { type, originAddress, targetAddress, messageId, data } = data
      this.handleDirectMessage(type, originAddress, targetAddress, messageId, data);
     })

     socket.on('getPeers', ()=>{
        socket.emit('address', this.nodeList.addresses);
     })

     socket.on('disconnect', ()=>{
       if(socket.handshake.headers.host){
         var disconnectedAddress = 'http://'+socket.handshake.headers.host
         delete this.peersConnected[disconnectedAddress]
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

    socket.on('newAccount', (account)=>{
      this.accountTable.addAccount(account).then((added)=>{
        if(added){
          logger(`New account -${account.name}- has been created!`)
          socket.emit('accountCreationSuccess', account)
          this.sendPeerMessage('newAccount', account)
        }else{
          socket.emit('accountCreationError', 'ERROR: Could not add account')
        }
      })
      
    })

    socket.on('getBlockSize', (number)=>{
      socket.emit('message', `Block number ${number-1} has ${Object.keys(this.chain.chain[number-1].transactions).length} transactions`)
    })

    socket.on('startMiner', ()=>{
      this.minerPaused = false;
      this.updateAndMine();
    })

    socket.on('stopMining', ()=>{
      logger('Mining stopped')
      this.UILog('Mining stopped')
      this.minerPaused = true;
      if(process.MINER){
        
        process.MINER.stop();
        process.MINER = false;
        
      }
    })

    socket.on('isChainValid', ()=>{
      this.validateBlockchain();
    })

    socket.on('update', (address)=>{
      if(address){
        this.fetchBlocks(address)
      }else{
        this.update()
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
    ////let myCoin = new Coin('EMU', 10000, {})
    socket.on('test', ()=>{
      let code = `
      function stackTrace() {
        var err = new Error();
        console.log((err.stack))
        }

        console.log(stackTrace())
      
      `
      callRemoteVM(code)
      // this.cashInCoinbaseTransactions();
    })

    socket.on('sumFee', async (number)=>{
      console.log(this.chain.gatherMiningFees(this.chain.chain[number]))
    })

    socket.on('accounts', ()=>{
      console.log(this.accountTable.accounts)
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
        this.broadcast('peerMessage', { 'type':type, 'messageId':messageId, 'originAddress':this.address, 'data':data });

      }catch(e){
        console.log(chalk.red(e));
      }

    }
  }

  sendDirectMessage(type, data){
    if(type){
      try{
        if(typeof data == 'object')
          data = JSON.stringify(data);
        var shaInput = (Math.random() * Date.now()).toString()
        var messageId = sha256(shaInput);
        this.messageBuffer[messageId] = messageId;
        this.broadcast('directMessage', { 
         'type':type,
         'messageId':messageId, 
         'originAddress':this.address, 
         'targetAddress':targetAddress, 
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
  handlePeerMessage(type, originAddress, messageId, data){
    let peerMessage = { 'type':type, 'originAddress':originAddress, 'messageId':messageId, 'data':data }

    if(!this.messageBuffer[messageId]){
      switch(type){
        case 'transaction':
          if(data){
            try{
              var transaction = JSON.parse(data);
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
            }catch(e){
              console.log(chalk.red(e))
            }
          }

          break;
        case 'endMining':
          if(this.minerStarted){
            this.minerPaused = true;
            if(process.MINER){
              process.MINER.stop();
              process.MINER = false;
              
            }
            
          }
          break;
        case 'newBlock':
          this.fetchBlocks(originAddress, (updated)=>{
            if(this.minerStarted){
              this.minerPaused = false;
              process.MINER = false;
              this.startMiner();
            }
          });
          break;
        case 'action':
         
            try{
              let action = JSON.parse(data);
              if(action && isValidActionJSON(action)){
                
                this.chain.validateAction(action)
                .then(isValid =>{
                  if(isValid){
                    //Action will be added to Mempool only is valid and if corresponds with contract call
                    logger(chalk.yellow('«-')+' Received valid action : '+ action.hash.substr(0, 15)+"...")
                    let mapsToContractCall = this.handleAction(action);
                    if(mapsToContractCall){
                      //Execution success message
                      //Need to avoid executing call on everynode simultaneously 
                      //Also need to avoid any security breach when signing actions
                    }
                  }else{
                    logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
                  }
                  
                })
              }else{
                console.log(data)
                console.log('ERROR: Invalid action structure')
              }
            }catch(e){
              console.log(e)
            }
            
          
        break
        case 'fetchCoinbaseTransaction':
          if(data && typeof data == 'string'){
            try{
              
              axios.get(originAddress+'/transaction', {
                params:{
                  hash:data
                }
              }).then((response)=>{
                if(response.data){
                  let transaction = response.data;
                  if(transaction && !transaction.error){
                    
                    this.chain.validateTransaction(transaction)
                    .then(valid => {
                      if(!valid.error && !valid.pending){
                        Mempool.addTransaction(transaction);
                        this.UILog('<-'+' Received valid coinbase transaction : '+ transaction.hash.substr(0, 15)+"...")
                        if(this.verbose) logger(chalk.blue('<-')+' Received valid coinbase transaction : '+ transaction.hash.substr(0, 15)+"...")
                      }else if(valid.pending && !valid.error){
                        //logger('Coinbase transaction from peer needs to wait five blocks')
                      }else{
                        this.UILog('!!!'+' Received invalid coinbase transaction : '+ transaction.hash.substr(0, 15)+"...")
                        if(this.verbose) logger(chalk.red('!!!'+' Received invalid coinbase transaction : ')+ transaction.hash.substr(0, 15)+"...")
                        Mempool.rejectedTransactions[transaction.hash] = transaction;
                        logger(valid.error)
                      }
                    })
                  }else{
                    //Can't fetch
                  }
                  
                 
                }
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
            }catch(e){
              console.log(chalk.red(e))
            }
          }
          break;
        case 'getLongestChain':
          try{
            if(this.chain instanceof Blockchain){
              axios.post(originAddress+'/chainLength', {
                length:this.chain.chain.length,
                peerAddress:this.address
              }).then((response)=>{
  
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
            }
            
          }catch(e){
            console.log(chalk.red(e))
          }
          break;
        case 'addressBroadcast':
          if(originAddress && typeof originAddress == 'string'){
            if(this.chain instanceof Blockchain){
              if(!this.chain.ipAddresses.includes(originAddress)){
                logger('Added '+originAddress+' to known node addresses')
                this.chain.ipAddresses.push(originAddress);
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
          case '':
          break;
        }
      }else if(this.connectionsToPeers[targetAddress]){

      }else if(this.peersConnected[targetAddress]){

      }else{
        this.messageBuffer[messageId] = directMessage;
        this.broadcast('directMessage', directMessage)
      }
      
    }
    
  }


  getAllHeaders(){
    
      try{
        
        var blockHashesFromIndex = [];
        var headers = []


          this.chain.chain.forEach((block)=>{
            blockHashesFromIndex.push(block.hash);
            headers.push(this.chain.getBlockHeader(block.blockNumber))
          })

          var chainInfo = {
            length: this.chain.chain.length,
            blockHashes:blockHashesFromIndex,
            headers:headers,
            address:this.address
          }

          return chainInfo

      }catch(e){
        console.log(chalk.red(e))
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
    Response to a getLongestChain, to determine from which peer to update
    @param {string} $address - Requesting peer address
  */
  sendChainLength(address){
    if(address){
      try{

        axios.post(peerAddress+'/chainLength', {
          chainLength:this.chain.chain.length,
          peerAddress:this.address
        })
        .then((response)=>{ logger(response.data); })
        .catch((err)=>{ logger('Could not send length of chain to peer', err.errno) })

      }catch(e){
        console.log(chalk.red(e));
      }
    }
  }


  /**
    Validates every block that gets added to blockchain.
    @param {Object} $newBlock - Block to be added
  */
  receiveNewBlock(newBlock){
      if(newBlock != undefined && newBlock != null && typeof newBlock == 'object'){
        let minerOfLastBlock = this.chain.getLatestBlock().minedBy;
        
        var isBlockSynced = this.chain.syncBlock(newBlock);
        if(isBlockSynced === true){
          Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
          logger(chalk.blue('* Synced new block '+newBlock.blockNumber+' with hash : '+ newBlock.hash.substr(0, 25)+"..."));
          logger(chalk.blue('* Number of transactions: ', Object.keys(newBlock.transactions).length))
          
          return true;
        }else if(typeof isBlockSynced === 'number' && isBlockSynced > 0){
          //Start syncing from the index returned by syncBlock;
          //this.fetchBlocks(minerOfLastBlock);
          logger('ERROR: Block already present in chain')
          return false;
        }else if(isBlockSynced < 0){
          logger('ERROR: Could not sync new block')
          return false;
        }else{
          return false;
        }
      }else{
        logger('ERROR: New block is undefined');
        return false;
      }
  }


  /**
    Peer discovery request
    @param {string} $address - Peer address
  */
  requestKnownPeers(address){
    let peerKnownNodes;

    axios.get(address+'/getAddress')
      .then((response) =>{
        peerKnownNodes = response.data.nodes;

        for(var i=0; i <peerKnownNodes.length; i++){
          var peer = peerKnownNodes[i];
          this.nodeList.addNewAddress(peer)
        }

      })
      .catch(function (error) {
        logger(error);
      })
  }

  fetchTransaction(address, hash){
    if(hash){
      axios.get(address+'/transaction', {
        params:{
          hash:hash
        }
      })
      .then(async (response) =>{
        let transaction = response.data;
        if(isValidTransactionJSON(transaction)){
          let isValid = await this.chain.validateTransaction(transaction);
          if(!isValid.error){
            Mempool.addTransaction(transaction)
          }else{
            logger(isValid.error);
          }
        }else{
          logger('ERROR: Received invalid transaction data format');
        }
        

      })
      .catch(function (error) {
        logger(error);
      })
    }
  }


  /**
    Keeps the sync on the blockchain. Can be launched manually upon creation of node
    to get in sync with the network.
    @param {string} $address - Peer address to sync with
    @param {function} $cb - Optional callback
  */
  fetchBlocks(address, cb){
    try{
      if(this.chain instanceof Blockchain){
        const latestBlock = this.chain.getLatestBlock();
        const latestBlockHeader = this.chain.getBlockHeader(latestBlock.blockNumber);

        
        axios.get(address+'/getNextBlock', { params: { hash: latestBlock.hash, header:latestBlockHeader } })
          .then((response) =>{
            var block = response.data;
            
            if(block){
              
                var synced = this.receiveNewBlock(block);  //Checks if block is valid and linked. Should technically validate all transactions
                if(!synced){
                  if(response.data.error == 'end of chain'){
                    
                    logger(chalk.green('Blockchain successfully updated'));
                    this.chain.isChainValid()
                    this.chain.saveBlockchain()

                    this.minerPaused = false;
                    if(cb){
                      cb(true)
                    }
                    return true;
                  }else if(response.data.error == 'block fork'){
                    let peerHeader = JSON.parse(response.data.header);

                    let isHeaderValid = this.chain.validateBlockHeader(peerHeader);
                    let isBlockConflict = (peerHeader.blockNumber == latestBlock.blockNumber) 
                                          && (peerHeader.hash !== latestBlock.hash);
                    let peerBlockHasMoreWork = (peerHeader.nonce > latestBlock.nonce);

                    logger('Is Header Valid:', isHeaderValid);
                    logger('Is Block Conflict:', isBlockConflict);
                    logger('Peer block has more work:', peerBlockHasMoreWork);

                    if(isHeaderValid && isBlockConflict){
                      if(peerBlockHasMoreWork){
                        let orphanBlock = this.chain.chain.pop();
                        this.chain.orphanedBlocks.push(orphanBlock);
                        this.resolveBlockFork(address);
                      }else{
                        logger("The current last block required more work than target peer's")
                      }
                    }else{
                      logger('Header is invalid');
                    }

                    
                  }else if(response.data.error == 'no block found'){
                    logger(chalk.red(response.data.error));
                    return false
                  }else if(response.data.error == 'invalid request parameters'){
                    logger(chalk.red(response.data.error))
                    return false
                  }else if(response.data.error == 'invalid block request JSON format'){
                    logger(chalk.red(response.data.error))
                    return false
                  }
                  return false

                }else{
                  setTimeout(()=>{
                    this.fetchBlocks(address)

                  },500)
                }
            }else{
              logger('No block received from '+address)
            }
          })
          .catch((error)=>{
            logger(error)
            logger(chalk.red('Could not fetch block from '+address))
            
            return false;
          })
      }
    }catch(e){
      console.log(chalk.red(e));
      return false;
    }


  }

  validateBlockchain(){
    if(this.chain instanceof Blockchain){
      this.chain.isChainValid()
    }
  }

   //could be moved to Blockchain.js
  compareHeaders(headers){
    // logger(headers)
    if(this.chain instanceof Blockchain){
      if(headers){
        for(var i=0; i < headers.headers.length; i++){

          var header = headers.headers[i]
          var localBlockHeader = this.chain.getBlockHeader(i);

          try{
            

            if(headers.headers.length < this.chain.chain.length){
              logger('This chain is longer than peer chain')
              return false;
            }

            if(i > 1 && header){

              let containsBlock = localBlockHeader.hash == header.hash;
              let isValid = this.chain.validateBlockHeader(header);

              if(!containsBlock) {
                console.log('Does not contain block ',i)
                return i
              };
              if(!isValid){
                console.log('Is not valid ', i);
                console.log(sha256(header.previousHash + header.timestamp + header.merkleRoot + header.nonce))
                let block = this.chain.chain[17];
                console.log('Block Hash:', block.hash);
                console.log('Header Hash',header.hash);
                console.log(sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce))
                
                console.log('Previous hash', header.previousHash);
                console.log('Timestamp', header.timestamp);
                console.log('Merkle', header.merkleRoot);
                console.log('Nonce', header.nonce)
                return false;
              } 
            }

          }catch(e){
            console.log(chalk.red(e))
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
        this.chain.orphanedBlocks.push(block)
      })

      return sideChain;
    }
  }

  resolveBlockFork(address){
    axios.get(address+'/getChainHeaders')
    .then((response)=>{

      let headers = response.data.chainHeaders
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

    })
    .catch((error)=>{
      
      logger(chalk.red('Could not fetch chain headers ', error.address))
       
    })
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
                  Mempool.rejectedTransactions[transaction.hash] = transaction;
                  resolve({error:valid.error});

                }
              })
          }
        
        
      }catch(e){
        console.log(chalk.red(e));
      }
    })
  }

  handleAction(action){
    switch(action.type){
      case 'createAccount':
        this.accountTable.addAccount(action.data);
        //Add account to data table as reference for contracts
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

    Mempool.addAction(action);
    return true;
  }

  executeAction(action){
    //To be implemented
  }

  broadcastNewAction(action){
    return new Promise((resolve, reject)=>{
      try{
        if(!action.signature){
          logger('ERROR: Action could not be emitted. Missing signature')
          resolve({error:'Action could not be emitted. Missing signature'})
        }else{
          this.chain.validateAction(action)
          .then(valid=>{
            if(valid && !valid.error){
              this.handleAction(action);
              if(this.verbose) logger(chalk.cyan('-»')+' Emitted action: '+ action.hash.substr(0, 15)+"...")
              this.sendPeerMessage('action', JSON.stringify(action, null, 2)); //Propagate transaction

              resolve(action)
            }else{
              logger('ERROR: Action is invalid')
              resolve({error:valid.error})
            }
          })
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

  updateAndMine(){
    this.sendPeerMessage('getLongestChain');
    logger('Querying the network for the longest chain before starting the miner')
    setTimeout(()=>{
      if(this.longestChain.peerAddress !== ''){
        this.fetchBlocks(this.longestChain.peerAddress, ()=>{
          logger('Starting miner!')
          this.outputToUI('Starting miner!')
          this.startMiner();
        })
      }else{
        return this.updateAndMine()
      }

    },8000)
  }

  forceMine(){
    logger('Starting miner!')
    this.outputToUI('Starting miner!')
    this.startMiner();
  }


  update(){
    this.sendPeerMessage('getLongestChain');
    logger('Querying the network for the longest chain')
    setTimeout(()=>{
      if(this.longestChain.peerAddress !== ''){
          this.fetchBlocks(this.longestChain.peerAddress, ()=>{
        })
      }else{
        
        return this.update();
      }

    },8000)
  }

  /**
    @desc Miner loop can be launched via the web UI or upon Node boot up
  */
  startMiner(){
    if(this.chain instanceof Blockchain){
        if(!this.minerStarted){
          this.minerStarted = true;
          setInterval(()=>{
            if(!process.MINER && !this.minerPaused){

             let isMining = this.chain.hasEnoughTransactionsToMine();
             let block = false;
             
             if(isMining && !block){
              
              let block = new Block(Date.now(), Mempool.gatherTransactionsForBlock(), Mempool.gatherActionsForBlock());
              logger('Mining next block...');
              logger('Number of pending transactions:', Mempool.sizeOfPool());
              Mempool.pendingTransactions = {};
              Mempool.pendingActions = {};

              this.chain.minePendingTransactions(this.address, block, this.publicKey, async(success, blockHash)=>{
                if(success && blockHash){
                 this.minerPaused = true;
                 process.MINER = false;
                 
                 this.sendPeerMessage('endMining', blockHash); //Cancels all other nodes' mining operations
                 
                 let newBlockHeight = this.chain.getLatestBlock().blockNumber;
                 this.chain.isChainValid()
                 this.chain.saveBlockchain();

                 let coinbase = await this.chain.createCoinbaseTransaction(this.publicKey, this.chain.getLatestBlock().hash)
                 if(coinbase){
                  this.chain.getLatestBlock().coinbaseTransactionHash = coinbase.hash;
                 }else{
                   logger('ERROR: An error occurred while creating coinbase transaction')
                 }
                 
                 
                 setTimeout(()=>{
                   //Leave enough time for the nodes to receive the two messages
                   //and for this node to not mine the previous, already mined block
                   this.sendPeerMessage('newBlock', blockHash); //Tells other nodes to come and fetch the block to validate it
                   
                   logger('Seconds past since last block',this.showBlockTime(newBlockHeight))
                   this.minerPaused = false;
                   let newBlockTransactions = this.chain.getLatestBlock().transactions;
                   let newBlockActions = this.chain.getLatestBlock().actions
                   Mempool.deleteTransactionsFromMinedBlock(newBlockTransactions);
                   Mempool.deleteActionsFromMinedBlock(newBlockActions);
                   this.cashInCoinbaseTransactions();

                 },3000)
                }else{
                   let transactionsOfCancelledBlock = block.transactions;
                   let actionsOfCancelledBlock = block.actions
                   Mempool.putbackPendingTransactions(transactionsOfCancelledBlock);
                   Mempool.putbackPendingActions(actionsOfCancelledBlock)
                   this.cashInCoinbaseTransactions();
                }
              })
             }else{
              //Block is currently being mined
             }
  
           }else{
             //Already started mining
           }
          }, 1000)
        }else{
          logger('WARNING: miner already started')
        }
        
      
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
                this.sendPeerMessage(transaction);
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
    
    logger('Saving known nodes to blockchain file');
    logger('Number of known nodes:', this.nodeList.addresses.length)
    
    this.chain.saveBlockchain()
      .then((saved)=>{
        
        this.nodeList.saveNodeList();
        Mempool.saveMempool();
        this.walletManager.saveState();
        this.saveNodeConfig()
        this.accountTable.saveTable();
        if(saved == true){
          logger('Successfully saved blockchain file')
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
