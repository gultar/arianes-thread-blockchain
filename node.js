/**



*/

'use strict'
const express = require('express');
const http = require('http');
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
const bodyParser = require('body-parser');
const {
  initBlockchain,
  loadBlockchainFromServer,
  saveBlockchain,
  instanciateBlockchain  } = require('./backend/blockchainHandler.js');
const Wallet = require('./backend/walletHandler');
const Blockchain = require('./backend/blockchain');
const Transaction = require('./backend/transaction');
const { displayTime, logger } = require('./backend/utils');
const sha256 = require('./backend/sha256');
const axios = require('axios');
const chalk = require('chalk');
let {miner} = require('./backend/globals');
// const RoutingTable = require('kademlia-routing-table')
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
    this.id = sha256(this.address);
    this.ioServer = {};
    this.wallets = {};
    this.publicKey = '';
    this.userInterfaces = [];
    this.peersConnected = {};
    this.connectionsToPeers = {};
    this.knownPeers = [];
    this.token = {};
    this.chain = {};
    this.messageBuffer = {};
    this.minerStarted = false;
    this.minerRunning
    this.verbose = false;
    this.longestChain = {
      length:0,
      peerAddress:''
    }  //Serves to store messages from other nodes to avoid infinite feedback
  }


  /**
    P2P Server with two main APIs. A socket.io API for fast communication with connected peers
    and an HTTP Api for remote peer connections as well as routine tasks like updating blockchain.
  */
  startServer(app=express()){
    try{

      console.log(chalk.cyan('\n******************************************'))
      console.log(chalk.cyan('*')+' Starting node at '+this.address+chalk.cyan(" *"));
      console.log(chalk.cyan('******************************************\n'))
      const expressWs = require('express-ws')(app);
      app.use(express.static(__dirname+'/views'));
      const server = http.createServer(app).listen(this.port);
      this.initHTTPAPI(app);
      this.cleanMessageBuffer();
      this.ioServer = socketIo(server, {'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':false });

      this.loadWallet((wallet)=>{
        this.wallets[wallet.id] = wallet;
        initBlockchain(this.address, true, (loadedBlockchain)=>{
          
          this.chain = loadedBlockchain;
          this.knownPeers=  loadedBlockchain.ipAddresses;
        });
      });


    }catch(e){
      logger(e);
    }

    this.ioServer.on('connection', (socket) => {
      if(socket){
        let peerAddress;
        let peerToken;
         if(socket.handshake.query.token !== undefined){

             try{

               socket.on('message', (msg) => { logger('Client:', msg); });
               peerAddress = socket.handshake.query.token.address;

               if(socket.request.headers['user-agent'] === 'node-XMLHttpRequest'){

                 this.peersConnected[peerAddress] = socket;
                 if(peerAddress && !this.knownPeers.includes(peerAddress)){
                   this.knownPeers.push(peerAddress);
                 }
                 this.nodeEventHandlers(socket)

               }else{
                 socket.emit('message', 'Connected to local node');
                 this.externalEventHandlers(socket);

               }

             }catch(e){
               logger(e)
             }

         }else{
           socket.emit('message', 'Connected to local node')
           this.externalEventHandlers(socket);
         }
      }

    });

    this.ioServer.on('disconnect', ()=>{ logger('a node has disconnected') })

    this.ioServer.on('error', (err) =>{ logger(err);  })
  }

  joinPeers(){
    try{
      if(this.knownPeers){
        this.knownPeers.forEach((peer)=>{
          this.connectToPeer(peer);
        })
      }
    }catch(e){
      logger(e)
    }

  }

  findPeers(){
    if(this.knownPeers.length > 0){
      logger('Requesting other peer addresses');
      this.serverBroadcast('getPeers');
    }else{
      this.joinPeers();
    }
  }

  //Only handles one wallet......
  /**
    Public (and optionally private) key loader
    @param {string} $callback - callback that hands out the loaded wallet
  */
  loadWallet(callback){
    //Fetch from .json file
    //Need to handle more than one
    let wallet = new Wallet();
    wallet.initWalletID((id)=>{
      wallet.id = id;
      this.wallets[wallet.id] = wallet;
      this.publicKey = wallet.publicKey
      callback(wallet)

    });
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
            'query':{
              token: { 'address':this.address }
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
              this.connectionsToPeers[address] = peer;
              logger(chalk.green('Connected to ', address))
              peer.emit('message', 'Peer connection established by '+ this.address+' at : '+ displayTime());
              this.UILog('Peer connection established by '+ this.address+' at : '+ displayTime())
              if(!this.knownPeers.includes(address))  {  this.knownPeers.push(address);  }
              
              peer.emit('connectionRequest', this.address);
            }else{
              logger('Already connected to target node')
            }
              

          })

          peer.on('message', (message)=>{
              logger('Server: ' + message);
          })

          peer.on('address', (response)=>{
            if(response && Array.isArray(response)){
              for(let address in response){
                if(!this.knownPeers.includes(address)){
                  // this.knownPeers.push(address);
                  this.connectToPeer(address);
                }
              }
            }
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
      logger('Address in undefined');
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
      logger(e);
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
          logger('Number of UIs', this.userInterfaces.length);
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
        logger(e);
      }
    }
  }
  sendToRemoteNode(type, data){
    if(type){
      try{
        // if(typeof data == 'object')
        //   data = JSON.stringify(data);
        // var shaInput = (Math.random() * Date.now()).toString()
        // var messageId = sha256(shaInput);
        // this.messageBuffer[messageId] = messageId;
        // this.serverBroadcast('peerMessage', { 'type':type, 'messageId':messageId, 'originAddress':this.address, 'data':data });

      }catch(e){
        logger(e);
      }

    }
  }
  


  /**
    Internode API that can be used by UIs to get data from blockchain and send transactions
    @param {Object} $app - Express App
  */
  initHTTPAPI(app){
    app.use(bodyParser.json());
    app.set('json spaces', 2)

    app.post('/node', (req, res) => {
      const { host, port } = req.body;
      const { callback } = req.query;
      const node = `http://${host}:${port}`;

      this.connectToPeer(node, ()=>{

      });
      res.json({ message: 'attempting connection to peer '+node}).end()
    });

    app.post('/transaction', (req, res) => {
      const { sender, receiver, amount, data } = req.body;
      let transaction = new Transaction(sender, receiver, amount, data);
      this.emitNewTransaction(sender, receiver, amount, data, (success)=>{
        if(!success){
          res.json({ message: 'transaction failed' }).end()
        }else{
          res.json({ message: 'transaction success' }).end();
        }
      })
    });

    app.get('/getAddress', (req, res)=>{
      res.json({ nodes: this.knownPeers }).end();
    })

    app.post('/chainLength', (req, res) =>{
      try{
        res.send('OK')
        const { length, peerAddress } = req.body;
        if(this.longestChain.length < length){
          this.longestChain.length = length;
          this.longestChain.peerAddress = peerAddress
          logger(peerAddress+' has sent its chain length: '+length)
          
        }
      }catch(e){
        logger("Could not receive chainLength response", e.errno);
      }
    })

    app.post('/chainInfo', (req, res) =>{
      const { chainInfo } = req.body;
      var isValidChain = this.validateChainInfo(chainInfo);
      if(isValidChain){
        this.fetchBlocks(chainInfo.address)
      }

    })

    app.get('/getChainInfo', (req, res)=>{
      try{
        let index = parseInt(req.query.index)
        logger(index)
        if(index >=0){
          let chainInfo = this.getChainInfo(index);
          if(chainInfo){
            res.json({ chainInfo:chainInfo }).end()
          }else{
            res.json({ error:'chain is not the longest' }).end()
          }
        }else{
          res.json({ error:'index of current block required' }).end()
        }
      }catch(e){
        logger(e);
      }


    })

    app.get('/getChainHeaders', (req, res)=>{
      try{

          let chainHeaders = this.getAllHeaders();
          res.json({ chainHeaders:chainHeaders }).end()

      }catch(e){
        logger(e);
      }


    })

    app.get('/getNextBlock', (req, res)=>{
      try{
        var blockHash = req.query.hash;
        var blockHeader = JSON.parse(req.query.header);

        if(this.chain instanceof Blockchain){
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
        }
      }catch(e){
        logger(e)
      }

    })

    app.get('/listOfBlockHashes', (req, res)=>{
      if(this.chain instanceof Blockchain){
        res.json(Object.keys(this.chain.chain)).end()
      }

    })

    app.get('/newBlock', (req, res)=>{
      if(this.chain instanceof Blockchain){
        res.json(this.chain.getLatestBlock()).end();
      }

    });

    // app.get('/chain', (req, res) => {
    //   try{
    //     res.json(this.chain).end();
    //   }catch(e){
    //     logger(e)
    //   }

    // });
  }


  /**
    Socket listeners only usable by server nodes
    @param {object} $socket - Client socket connection to this node's server
  */
  nodeEventHandlers(socket){
    if(socket){

     socket.on('error', (err)=>{
       logger(err);
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
        socket.emit('address', this.knownPeers);
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
      logger(err);
    })
    socket.on('connectionRequest', (address)=>{
      this.connectToPeer(address, (peer)=>{});
    });
    socket.on('getBlockchain', ()=>{
      socket.emit('blockchain', this.chain);
    })
    socket.on('transaction', (fromAddress, toAddress, amount, data)=>{
      this.emitNewTransaction(fromAddress, toAddress, amount, data);
    })
    socket.on('getAddress', (address)=>{
      this.requestKnownPeers(address);
    })

    socket.on('knownPeers', ()=>{
      try{
        socket.emit('message', JSON.stringify({ peers:this.knownPeers }, null, 2))
      }catch(e){
        logger(e)
      }
    })

    socket.on('startMiner', ()=>{
      this.updateAndMine();
    })

    socket.on('isChainValid', ()=>{
      this.validateBlockchain();
    })

    socket.on('changeConnectAddress', (address)=>{ //For testing purposes only
      this.address = address;
    })

    socket.on('update', (address)=>{
      if(address){
        this.fetchBlocks(address)
      }else{
        this.update()
      }
    })

    socket.on('txgen', ()=>{
      this.txgen();
    })

    socket.on('verbose', ()=>{
      if(this.verbose) this.verbose = false;
      else this.verbose = true;
    })

    socket.on('stoptxgen', ()=>{
      stopTxgen = true;
    })

    socket.on('test', ()=>{
      let headers = this.getAllHeaders();
      let headers2 = this.getAllHeaders();
      let compare = this.compareHeaders(headers);
      console.log('Headers 1', compare)
      console.log('Chain length', this.chain.chain.length)
      console.log('Nb of headers', headers.headers.length)
      headers2.headers.pop()
      let compare2 = this.compareHeaders(headers2);
      console.log('Headers 2', compare2);
      console.log('Chain length', this.chain.chain.length)
      console.log('Nb of headers', headers2.headers.length)
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
        logger(e);
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
            if(transaction && !this.chain.pendingTransactions[transaction.hash]){

              this.chain.validateTransaction(transaction, (valid)=>{
                if(valid){
                  this.chain.pendingTransactions[transaction.hash] = transaction;
                  this.UILog('<-'+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
                  if(this.verbose) logger(chalk.green('<-')+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
                }
              });

            }
          }catch(e){
            logger(e)
          }
          break;
        case 'endMining':
          if(this.minerStarted){
            this.minerPaused = true;
            if(process.MINER){
              
              process.MINER.stop()
              
            }
            
          }
          break;
        case 'newBlock':
          this.fetchBlocks(originAddress, (updated)=>{
            if(this.minerStarted){
              this.minerPaused = false;
              this.startMiner();
            }
          });
          break;
        case 'whoisLongestChain':
          try{
            axios.post(originAddress+'/chainLength', {
              length:this.chain.chain.length,
              peerAddress:this.address
            }).then((response)=>{

            }).catch((e)=>{
              logger(e)
            })
          }catch(e){
            logger(e)
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


  /**
    @param {number} $index - gather all chain info starting from this index
  */
  getChainInfo(index){
    if(index >= 0){
      try{
        var chainLength = this.chain.chain.length;
        var blockHashesFromIndex = [];
        var headers = []
        if(index < chainLength){
          for(var i=index; i <chainLength; i++){
            blockHashesFromIndex.push(this.chain.chain[i].hash);
            headers.push(this.chain.getBlockHeader(i))
          }

          var chainInfo = {
            length: chainLength,
            blockHashes:blockHashesFromIndex,
            headers:headers,
            address:this.address
          }

          return chainInfo

        }else{
          return false
        }


      }catch(e){
        logger(e)
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
        logger(e)
      }
    


  }


  /**
    This a way to verify if the peer has a valid chain before updating through him
    @param {object} $chainInfo - all block hashes, headers and its chain length
  */
  validateChainInfo(chainInfo){
    try{
      var isLinked = false;
      var areHashesValid = false;
      for(var i=1; i < chainInfo.headers.length; i++){

          areHashesValid = this.chain.validateBlockHeader(chainInfo.headers[i]);

          var currentHeader = chainInfo.headers[i];

          if(i > 1 && currentHeader){
            isLinked = chainInfo.headers[i-1].hash == currentHeader.previousHash

            if(!isLinked && areHashesValid){
              logger("Block number "+i+" is not linked");
              return false;
            }else if(!isLinked && !areHashesValid){
              logger("Block number "+i+" is not linked");
              logger('Header hashes are not valid at position '+i);
              return false;
            }else if(isLinked && !areHashesValid){
              logger('Header hashes are not valid at position '+i);
              return false;
            }
          }



      }

      return isLinked;
    }catch(e){
      logger(e)
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
        .then(function (response) {
            logger(response.data);
        })
        .catch((err)=>{

          logger('Could not send length of chain to peer', err.errno)
        })
      }catch(e){
        logger(e);
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

          logger(chalk.blue(' * Synced new block '+newBlock.blockNumber+' with hash : '+ newBlock.hash.substr(0, 25)+"..."));
          this.clearOutPendingTransactions(Object.keys(newBlock.transactions))

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
          if(!this.knownPeers.includes(peer)){
            this.knownPeers.push(peer);
          }
        }

      })
      .catch(function (error) {
        logger(error);
      })
  }


  /**
    Keeps the sync on the blockchain. Can be launched manually upon creation of node
    to get in sync with the network.
    @param {string} $address - Peer address to sync with
    @param {function} $cb - Optional callback
  */
 fetchBlocks(address, cb){
  this.minerPaused = true;
  //var updateAddress = (address ? address : longestChain.peerAddress)
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
                  logger('Chain is still valid: ', this.chain.isChainValid())
                  saveBlockchain(this.chain)

                  
                  if(this.minerStarted){
                    this.minerPaused = false;
                    this.startMiner()
                  }
                  
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
                }
                return false
              }else{
                setTimeout(()=>{
                  this.fetchBlocks(address)

                },500)
              }
          }
        })
        .catch((error)=>{
          logger('Could not fetch block from http://'+ error.address+":"+error.port)
          
          return false;
        })
    }
  }catch(e){
    logger(e);
    return false;
  }


 }


  validateBlockchain(){
     logger('Chain is still valid:',this.chain.isChainValid())
  }

  compareChainHeaders(headers){
    // logger(headers)
    if(this.chain instanceof Blockchain){
      if(headers){
        for(var i=0; i < headers.headers.length; i++){

          var header = headers.headers[i]
          var localBlockHeader = this.chain.getBlockHeader(i+1);

          try{
            var peerChainIsLongerThanThisChain = (headers.headers.length +1 > this.chain.chain.length);

            if(!peerChainIsLongerThanThisChain){
              logger('This chain is longer than peer chain')
              return false;
            }

            if(i > 1 && header){

              let containsBlock = localBlockHeader.hash == header.hash;
              let isValid = this.chain.validateBlockHeader(header);

              if(!containsBlock) return i;
              if(!isValid) return false;
            }

          }catch(e){
            logger(e)
          }


        }
        return true;
      }
    }
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
            logger(e)
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
         var ind1 = latestBlock.blockNumber;
         var ind2 = ind1-1;
         var blockBeforeThat = this.chain.chain[ind2];
         return ((latestBlock.timestamp - blockBeforeThat.timestamp)/1000)
       }
     }catch(e){
       logger(e)
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
      // logger(error)
      logger('Could not fetch block from ', error.address)
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          // logger(error.response.data);
          // logger(error.response.status);
          // logger(error.response.headers);
      } else if (error.request) {
          // The request was made but no response was received
          // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
          // http.ClientRequest in node.js
          // logger(error.request);
          
      } else {
          // Something happened in setting up the request that triggered an Error
          logger('Error', error.message);
      }
      // logger(error.config);
    })
  }


  /**
    @desc Emits all transactions as peerMessages.
    @param {string} $sender - Sender of coins's Public key
    @param {string} $receiver - Receiver of coins's Public key
    @param {number} $amount - Amount of coins to send. Optional IF blockbase query
    @param {object} $data - data to send along with transaction
  */
  emitNewTransaction(sender, receiver, amount, data){
    try{
      let transaction = new Transaction(sender, receiver, amount, data);
      let transactionValidated;
      transaction.sign((signature)=>{
        if(!signature){
          logger('Transaction signature failed. Check both public key addresses.')
          return false
        }else{
          transaction.signature = signature;
          this.chain.validateTransaction(transaction, (valid)=>{
            if(valid){
              this.chain.createTransaction(transaction);
              this.UILog('Emitted transaction: '+ transaction.hash.substr(0, 15)+"...")
              if(this.verbose) logger(chalk.blue('->')+' Emitted transaction: '+ transaction.hash.substr(0, 15)+"...")
              this.sendPeerMessage('transaction', JSON.stringify(transaction)); //Propagate transaction

            }else{
              logger('Received an invalid transaction');
              return false;
            }

          })
        }

      })

    }catch(e){
      logger(e);
    }

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
        // this.startMiner()
        return this.update();
      }

    },8000)
  }

  /**
    @desc Miner loop can be launched via the web UI or upon Node creation
  */
  startMiner(){

      if(this.chain instanceof Blockchain){
        this.minerStarted = true;
        if(!this.minerPaused){
          this.chain.minePendingTransactions(this.address, this.publicKey, (success, blockHash)=>{
            try{
              if(success){
                if(blockHash){

                  this.sendPeerMessage('endMining', blockHash); //Cancels all other nodes' mining operations
                  logger('Chain is still valid: ', this.chain.isChainValid()) //If not valid, will output conflicting block
                  saveBlockchain(this.chain);

                  setTimeout(()=>{

                    this.sendPeerMessage('newBlock', blockHash); //Tells other nodes to come and fetch the block to validate it
                    logger('Seconds past since last block',this.showBlockTime(this.chain.getLatestBlock().blockNumber))
                    
                    setTimeout(()=>{
                      this.startMiner()
                    }, 3000);
                  },2000)
                }
              }else{
                setTimeout(()=>{
                  this.startMiner();
                },1000)
  
              }
            }catch(e){
              logger(e)
            }
          });
        }
         
        

      }

  }
  /**
    @desc Fires upon sync block to avoid transaction doubles
    @param {array} $hashesOfTransactions - List of block transactions to delete from pending transactions
  */
  clearOutPendingTransactions(hashesOfTransactions){
    for(var transact of Object.keys(hashesOfTransactions)){
      if(this.chain.pendingTransactions[transact]){
        delete this.chain.pendingTransactions[transact];
      }
    }
  }

  save(callback){
    this.chain.ipAddresses = this.knownPeers;
    if(callback){
      saveBlockchain(this.chain, (saved)=>{
        callback(saved);
      });
    }else{
      saveBlockchain(this.chain);
    }
    
    
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
      // logger(message, arg);
      this.outputToUI(message, arg)
    }else{
      // logger(message);
      this.outputToUI(message)
    }
  }


  txgen(){
    if(!stopTxgen){
      let increaseThreshold = 0.5;
      setTimeout(()=>{
        this.emitNewTransaction(this.publicKey, "-----BEGIN PUBLIC KEY-----"+
        "MCAwDQYJKoZIhvcNAQEBBQADDwAwDAIFAIF3Sr0CAwEAAQ==-----END PUBLIC KEY-----", 0, '')

        txgenCounter = (Math.random() > increaseThreshold ? txgenCounter + 200 : txgenCounter - 200);
        if(txgenCounter < 1000) txgenCounter = 2000
        this.txgen()
      },txgenCounter)

    }
  }

  // setupBlockbase(){
  //   const table = new RoutingTable(randomBytes(32))
  //
  //   // Add a node to the routing table
  //   table.add({
  //     id: randomBytes(32), // this field is required
  //     nodeAddress:this.address
  //   })
  //
  //   table.on('row', function (row) {
  //     // A new row has been added to the routing table
  //     // This row represents row.index similar bits to the table.id
  //
  //     row.on('full', function (node) {
  //       // The row is full and cannot be split, so node cannot be added.
  //       // If any of the nodes in the row are "worse", based on
  //       // some application specific metric then we should remove
  //       // the worst node from the row and re-add the node.
  //     })
  //   })
  // }


}





module.exports = Node
