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
/**************Live instances******************/
const Mempool = require('./backend/classes/mempool'); //Instance not class
const WalletConnector = require('./backend/classes/walletConnector'); //Instance not class
/****************Tools*************************/
const { displayTime, logger } = require('./backend/tools/utils');
const {
  isValidTransactionJSON,
  isValidChainLengthJSON,
  isValidWalletRequestJSON,
  isValidGetNextBlockJSON,
  isValidHeaderJSON,
} = require('./backend/tools/jsonvalidator')
const sha256 = require('./backend/tools/sha256');
const sha1 = require('sha1')
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');

//To be removed
let txgenCounter = 5000;
let stopTxgen = false;
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
      const expressWs = require('express-ws')(app);
      app.use(express.static(__dirname+'/views'));
      express.json({ limit: '300kb' })
      app.use(helmet())
      const server = http.createServer(app).listen(this.port);

      this.initHTTPAPI(app);
      this.cleanMessageBuffer();
      this.ioServer = socketIo(server, {'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':false });
      
      //Loading blockchain from file
      initBlockchain()
        .then(chain => {
          if(chain){
            logger('Blockchain successfully loaded')
            this.chain = chain;

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

      //Loading transaction Mempool
      
      
      //Loading this node's wallet
      this.loadNodeWallet(`./wallets/${this.port}-${sha1(this.port)}.json`) //'./wallets/'+this.id+'.json'
        .then((walletLoaded)=>{
          if(walletLoaded){
            logger('Wallet loaded:', sha1(this.port))
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
      
    }catch(e){
      console.log(chalk.red(e));
    }

    this.ioServer.on('connection', (socket) => {
      if(socket){
        let peerAddress;
        let peerToken;
         if(socket.handshake.query.token !== undefined){
             try{
               socket.on('message', (msg) => { logger('Client:', msg); });

               peerToken = JSON.parse(socket.handshake.query.token);
               peerAddress = peerToken.address

              //Implement checksum based authentification
               if(socket.request.headers['user-agent'] === 'node-XMLHttpRequest'){
                 this.peersConnected[peerAddress] = socket;
                 this.nodeList.addNewAddress(peerAddress)
                 this.nodeEventHandlers(socket)

               }else{
                 socket.emit('message', 'Connected to local node');
                 this.externalEventHandlers(socket);
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
    Public (and optionally private) key loader
    @param {string} $callback - callback that hands out the loaded wallet
  */
  loadNodeWallet(filename){
    
    try{
      return new Promise(async (resolve, reject)=>{
        
        fs.exists(filename, async (exists)=>{
          if(exists){
            
              let myWallet = new Wallet();
              let loaded = await myWallet.importWalletFromFile(filename);
              
              if(loaded){
                this.publicKey = myWallet.publicKey;
                WalletConnector.wallets[this.publicKey] = myWallet;
                resolve(true)
              }else{
                logger(chalk.red('ERROR: Failed to load wallet from file'));
                resolve(false)
              }
              
              
            
          }else{
            
              let created = await this.createNodeWallet();
              resolve(created);
    
          }
          
        })
      })

    }catch(e){
      console.log(chalk.red(e));
    }
    
  }

  createNodeWallet(){
    return new Promise((resolve, reject)=>{
      WalletConnector.createWallet(this.port)
        .then((wallet)=>{
          if(wallet){
            resolve(true);
          }else{
            logger('ERROR: Wallet creation failed');
            resolve(false);
          }
          
        })
        .catch(e =>{
          console.log(e)
        })
    })
    
  }


  /**
    Basis for P2P connection
  */
  connectToPeer(address, callback){

    if(address){
      if(this.connectionsToPeers[address] == undefined){
        let connectionAttempts = 0;
        let peer;
        try{
          peer = ioClient(address, {
            'reconnection limit' : 1000,
            'max reconnection attempts' : 3,
            'query':
            {
              token: JSON.stringify({ 'address':this.address })
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
              //Console output
              logger(chalk.green('Connected to ', address))
              this.UILog('Connected to ', address+' at : '+ displayTime())
              //Messages emitted to peer
              peer.emit('message', 'Peer connection established by '+ this.address+' at : '+ displayTime());
              peer.emit('connectionRequest', this.address);
              this.sendPeerMessage('addressBroadcast');
              //Handling of socket and peer address
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

    }else{
      logger(chalk.red('ERROR: Address in undefined'));
    }
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
      
      app.post('/node', (req, res) => {
        const { host, port } = req.body;
        const node = `http://${host}:${port}`;
  
        this.connectToPeer(node);
        res.json({ message: 'attempting connection to peer '+node}).end()
      });
      
      app.get('/transaction', (req, res)=>{
        let tx = {};
        let pendingTx = {};
        let hash = req.query.hash;
        
        if(hash){
          tx = this.chain.getTransactionFromChain(hash);
          if(tx){
            res.json({ tx:tx }).end()
          }else{

            pendingTx = Mempool.getTransactionFromPool(hash);
            
            if(pendingTx){
              res.json({ pendingTx:pendingTx }).end()
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
            let { sender, receiver, amount, data } = req.body;
  
            this.broadcastNewTransaction(sender, receiver, amount, data)
            .then((transactionEmitted)=>{
              
              if(transactionEmitted.error){
                res.send(transactionEmitted.error)
              }else{
                let signature = transactionEmitted.signature;
                let hash = transactionEmitted.hash;
                res.send(this.generateReceipt(sender, receiver, amount, data, signature, hash));
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

      // app.post('/signCoinbaseTx', (req, res)=>{
      //   console.log('BODY OF REQUEST')
      //   console.log(req.body)
      //   let { signature, hash, publicKey } = req.body;
      //   if(hash && signature && publicKey){
      //     let coinbaseTx = Mempool.getCoinbaseTransaction(hash);
      //     if(coinbaseTx){
      //       if(!coinbaseTx.signatures) coinbaseTx.signatures = {}
      //       coinbaseTx.signatures[publicKey] = signature;
      //       logger('RECEIVED SIGNATURE:', signature)
      //       res.send('SUCCESS: Received peer signature')
      //     }else{
      //       logger('ERROR: coinbase not found')
      //       res.send('ERROR: could not sign coinbase transaction')
      //     }
          
      //   }
      // })

      // app.get('/coinbaseTransaction', (req, res)=>{
        
      //   let hash = req.query.hash;
        
      //   if(hash){
      //     let coinbaseTx = Mempool.getCoinbaseTransaction(hash);
      //     if(tx){
      //       res.json({ tx:coinbaseTx }).end()
      //     }else{
      //       res.json({ error:'coinbase transaction not found' }).end()
      //     }
      //   }else{
      //     res.json({ error:'invalid transaction hash'}).end()
      //   }
        
      // })
  
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
  
      app.post('/createWallet', (req, res)=>{
        if(isValidWalletRequestJSON(req.body)){
          const { name } = req.body;
          if(name){
            
            WalletConnector.createWallet(name)
            .then((wallet)=>{
              if(wallet){
                res.send(this.generateWalletCreationReceipt(wallet))
              }else{
                logger('ERROR: Wallet creation failed');
                res.send('ERROR: Wallet creation failed');
              }
              
            })
            .catch(e =>{
              console.log(e)
            })
          }else{
            res.send('ERROR: No wallet name provided')
          }
        }else{
          res.send('ERROR: invalid JSON wallet creation format')
        }
          
      })
  
      app.get('/getWalletPublicInfo', async (req, res)=>{
        if(isValidWalletRequestJSON(req.query)){
          try{
            let walletName = req.query.name;
            
            if(walletName){
              let wallet = await WalletConnector.getWalletByName(walletName);
              if(wallet){
                res.json(wallet).end();
              }else{
                res.json({error:`wallet ${walletName} not found`}).end()
              }
              
            }else{
              res.json({error:'no wallet name provided'}).end();
            }
          }catch(e){
            console.log(e);
          }
        }else{
          res.json({ error:'invalid JSON wallet creation format' }).end()
        }
       
  
      })
  
      app.get('/loadWallet', async (req, res)=>{
        if(isValidWalletRequestJSON(req.query)){
          try{
            let walletName = req.query.name;
            
            if(walletName){
              let wallet = await WalletConnector.loadWallet(walletName);
              logger(`Loaded wallet ${walletName}`)
              res.json(wallet).end();
            }
          }catch(e){
            console.log(e);
          }
        }else{
          res.json({ error:'invalid JSON wallet creation format' }).end()
        }
        
      })

      app.get('/getWalletBalance', async(req, res)=>{
        if(isValidWalletRequestJSON(req.query)){
          let walletName = req.query.name;
          if(walletName){
            let publicKey = await WalletConnector.getPublicKeyOfWallet(walletName);
            if(publicKey){
              res.json({ 
                balance: 
                this.chain.getBalanceOfAddress(publicKey) 
                + this.chain.checkFundsThroughPendingTransactions(publicKey)
              }).end()
            }else{
              res.json({ error:'could not find balance of unknown wallet' })
            }

            
          }else{
            res.json({ error:'must provide wallet name' })
          }
        }else{
          res.json({ error:'invalid JSON wallet creation format' }).end()
        }
      })

      app.get('/getWalletHistory', async(req, res)=>{
        if(isValidWalletRequestJSON(req.query)){
          let walletName = req.query.name;
          if(walletName){
            let publicKey = await WalletConnector.getPublicKeyOfWallet(walletName);
            if(publicKey){
              res.json({ history:this.chain.getTransactionHistory(publicKey) }).end()
            }else{
              res.json({ error:'could not find balance of unknown wallet' })
            }

            
          }else{
            res.json({ error:'must provide wallet name' })
          }
        }else{
          res.json({ error:'invalid JSON wallet creation format' }).end()
        }
        
        
      })

      app.get('/listWallets', async(req, res)=>{
        res.json(WalletConnector.wallets).end()
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
  
    }catch(e){
      logger("ERROR: getNextBlock request could not be completed: An error occured");
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

    socket.on('transaction', (fromAddress, toAddress, amount, data)=>{
      this.broadcastNewTransaction(fromAddress, toAddress, amount, data);
    })

    socket.on('getAddress', (address)=>{
      this.requestKnownPeers(address);
    })

    socket.on('getKnownPeers', ()=>{
      socket.emit('knownPeers', this.nodeList.addresses);
    })

    socket.on('getBlockSize', (number)=>{
      socket.emit('message', `Block number ${number-1} has ${Object.keys(this.chain.chain[number-1].transactions).length} transactions`)
    })

    socket.on('getBlockTxHashes', (number)=>{
      socket.emit('txHashes', Object.keys(this.chain.chain[number-1].transactions))
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

    socket.on('txgen', ()=>{
      this.UILog('Starting transaction generator');
      logger('Starting transaction generator')
      this.txgen();
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

    socket.on('stoptxgen', ()=>{
      this.UILog('Stopping transaction generator');
      logger('Stopping transaction generator')
      stopTxgen = true;
    })

    socket.on('getMempool', ()=>{
      socket.emit('mempool', Mempool);
    })

    socket.on('test', ()=>{
		
      this.coinbaseTxIsReadyToCashIn();
      
      
    })

    socket.on('sign', (address, hash)=>{
      this.sendCoinbaseSignatureToMiner(address, { coinbaseTransactionHash:hash })
      logger('sending a signature');
    })
	
    socket.on('txSize', (hash)=>{
      if(Mempool.pendingTransactions.hasOwnProperty(hash)){
        let tx = Mempool.pendingTransactions[hash];
        
        logger('Size:'+ (Transaction.getTransactionSize(tx) / 1024) + 'Kb');
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
          try{
            var transaction = JSON.parse(data);
            if(transaction && this.chain instanceof Blockchain){

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
          }catch(e){
            console.log(chalk.red(e))
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
        case 'fetchCoinbaseTransaction':
          if(data && typeof data == 'string'){
            try{
              logger('Fetching new coinbase transaction from ', originAddress)
              axios.get(originAddress+'/transaction', {
                param:{
                  txHash:data
                }
              }).then((response)=>{
                console.log(response)
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
            }catch(e){
              console.log(chalk.red(e))
            }
          }
          break;
        case 'whoisLongestChain':
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


  /**
    Response to a whoisLongestChain, to determine from which peer to update
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
        if(transaction){
          let isValid = await this.chain.validateTransaction(transaction);
          if(!isValid.error){
            Mempool.addTransaction(transaction)
          }else{
            logger(isValid.error);
          }
        }else{
          logger('ERROR: No transaction found');
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
            //logger(error.errno)
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
    this.chain.isChainValid()
  }

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
  async broadcastNewTransaction(sender, receiver, amount, data){
    return new Promise( async (resolve, reject)=>{
      try{
        let transaction = new Transaction(sender, receiver, amount, data);
        
        let wallet = WalletConnector.getWalletByPublicAddress(sender);

        if(!wallet){
          logger('ERROR: Could not find wallet of sender address')
          resolve({error:'ERROR: Could not find wallet of sender address'});
        }else{
          let signature = await wallet.sign(transaction.hash);
          
          if(!signature){
            logger('Transaction signature failed. Check both public key addresses.')
            resolve({error:'Transaction signature failed. Check both public key addresses.'})
            
          }else if(signature.walletLocked){

          }else{
            transaction.signature = signature;
            
            this.chain.createTransaction(transaction)
              .then( valid =>{
                if(!valid.error){

                  Mempool.addTransaction(transaction);
                  this.UILog('Emitted transaction: '+ transaction.hash.substr(0, 15)+"...")
                  if(this.verbose) logger(chalk.blue('->')+' Emitted transaction: '+ transaction.hash.substr(0, 15)+"...")
                  
                  this.sendPeerMessage('transaction', JSON.stringify(transaction)); //Propagate transaction
                  resolve(transaction)

                }else{

                  this.UILog('!!!'+' Rejected transaction : '+ transaction.hash.substr(0, 15)+"...")
                  if(this.verbose) logger(chalk.red('!!!'+' Rejected transaction : ')+ transaction.hash.substr(0, 15)+"...")
                  Mempool.rejectedTransactions[transaction.hash] = transaction;
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

  // async sendCoinbaseSignatureToMiner(minerAddress, block){
  //   if(minerAddress && block && block.hasOwnProperty('coinbaseTransactionHash')){
  //     let coinbasetTxHash = block.coinbaseTransactionHash;
  //     let signature = await WalletConnector.sign(this.publicKey, coinbasetTxHash);
  //     if(signature){
  //       console.log('Address:', minerAddress+'/signCoinbaseTx')
  //       axios.post(minerAddress+'/signCoinbaseTx', {
  //         signature:signature,
  //         hash:coinbasetTxHash,
  //         publicKey:this.publicKey
  //       })
  //       .then(response =>{
  //         console.log(response)
  //       })
  //       .catch(e =>{
  //         console.log(e)
  //       })
  //     }else{
  //       logger('ERROR: could not sign coinbase transaction')
  //     }

      
  //   }
  // }

  generateReceipt(sender, receiver, amount, data, signature, hash){
    const receipt = 
    `Transaction receipt:
    Sender: ${sender}
    Receiver: ${receiver}
    Amount: ${amount}
    Data: ${data}
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
     Wallet id: ${wallet.id}`;

     return receipt;
  }

  updateAndMine(){
    this.sendPeerMessage('whoisLongestChain');
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


  update(){
    this.sendPeerMessage('whoisLongestChain');
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
              this.cashInCoinbaseTransactions();
              let block = new Block(Date.now(), Mempool.gatherTransactionsForBlock());
              logger('Mining next block...');
              logger('Number of pending transactions:', Mempool.sizeOfPool());
              Mempool.pendingTransactions = {};
              

              this.chain.minePendingTransactions(this.address, block, this.publicKey, async(success, blockHash)=>{
                if(success && blockHash){
                 this.minerPaused = true;
                 process.MINER = false;
                 
                 this.sendPeerMessage('endMining', blockHash); //Cancels all other nodes' mining operations
                 
                 let newBlockHeight = this.chain.getLatestBlock().blockNumber;
                 this.chain.isChainValid()
                 this.chain.saveBlockchain();

                 let coinbase = await this.chain.createCoinbaseTransaction(this.publicKey)
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
                   Mempool.deleteTransactionsFromMinedBlock(newBlockTransactions);
                   

                 },3000)
                }else{
                   let transactionsOfCancelledBlock = block.transactions;
                   Mempool.putbackPendingTransactions(transactionsOfCancelledBlock);
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
                console.log('Ready to move:', readyToMove)
                Mempool.moveCoinbaseTransactionToPool(transaction.hash);
                setTimeout(()=>{
                  this.sendPeerMessage('fetchCoinbaseTransaction', transaction.hash);
                  resolve(true);
                },1000)
                
              }else{
                if(readyToMove.error){
                  logger(readyToMove.error);
                }else if(readyToMove.pending){
                  logger(readyToMove.pending)
                }
              }
                
              
            }else{
              logger('ERROR: coinbase transaction not found');
              reject({error:'ERROR: coinbase transaction not found'})
            }
           
          
          
        })
        
      }
    })
  
  }

  maintenance(){

  }

  save(callback){
    
    logger('Saving known nodes to blockchain file');
    logger('Number of known nodes:', this.nodeList.addresses.length)
    
    this.chain.saveBlockchain()
      .then((saved)=>{
        
        this.nodeList.saveNodeList();
        Mempool.saveMempool();
        WalletConnector.saveState();

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


  txgen(){
    if(!stopTxgen){
      let increaseThreshold = 0.5;
      setTimeout(()=>{
        if(this.publicKey){
          this.broadcastNewTransaction(this.publicKey, "A+Co6v7yqFO1RqZf3P+m5gzdkvSTjdSlheaY50e9XUmp", 0, '')

          txgenCounter = (Math.random() > increaseThreshold ? txgenCounter + 200 : txgenCounter - 200);
          if(txgenCounter < 1000) txgenCounter = 2000
          this.txgen()
        }
        
      },txgenCounter)

    }
  }

}


module.exports = new Node()
