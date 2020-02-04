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
const EventEmitter = require('events')
//*********** Websocket connection**************/
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
//************Blockchain classes****************/
const Blockchain = require('./modules/classes/blockchain/chain');
const Block = require('./modules/classes/blockchain/block')
const NodeList = require('./modules/classes/tables/nodelist');
const WalletManager = require('./modules/classes/wallets/walletManager');
const AccountCreator = require('./modules/classes/accounts/accountCreator');
const PeerDiscovery = require('./modules/network/peerDiscovery');
const SSLHandler = require('./modules/network/sslHandler')
const Mempool = require('./modules/classes/mempool/pool');
const PeerManager = require('./modules/network/peerManager')
const NetworkManager = require('./modules/network/networkManager')
/****************** APIs ********************* */
const MinerAPI = require('./modules/api/minerApi')
const HttpAPI = require('./modules/api/httpApi')
/****************Tools*************************/
const { 
  displayTime, 
  displayDate, 
  logger, 
  writeToFile, 
  readFile, 
  isHashPartOfMerkleTree, 
  createDirectoryIfNotExisting } = require('./modules/tools/utils');

const {
  isValidTransactionJSON,
  isValidTransactionCallJSON,
  isValidCallPayloadJSON,
  isValidWalletBalanceJSON,
  isValidActionJSON,
  isValidBlockJSON
} = require('./modules/tools/jsonvalidator');
const sha256 = require('./modules/tools/sha256');
const getGenesisConfigHash = require('./modules/tools/genesisConfigHash')
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
    //Genesis Configs
    this.genesis = options.genesis
    //Network tools
    this.ssl = new SSLHandler()
    this.network = options.network
    process.NETWORK = this.network
    this.networkManager = new NetworkManager(this.network)
    
    //Basic node configs
    this.host = options.host || 'localhost',
    this.lanHost = options.lanHost
    this.port = options.port || '8000'
    this.httpsEnabled = options.httpsEnabled
    this.httpPrefix = (this.httpsEnabled ? 'https' : 'http')
    this.exposeHTTP = options.exposeHTTP || false
    this.exposeControlPanel = options.exposeControlPanel || true
    this.address = `${this.httpPrefix}://${this.host}:${this.port}`;
    this.lanAddress = `${this.httpPrefix}://${this.lanHost}:${this.port}`;
    this.minerPort = options.minerPort || parseInt(this.port) + 2000
    //MinerWorker
    this.minerAPI = {}
    this.minerChannel = new EventEmitter()
    
    this.id = options.id || sha1(Math.random() * Date.now());
    this.publicKey = options.publicKey;
    this.verbose = options.verbose;
    this.enableLocalPeerDiscovery = options.enableLocalPeerDiscovery;
    this.enableDHTDiscovery = options.enableDHTDiscovery;
    this.peerDiscoveryPort = options.peerDiscoveryPort || '6000';
    this.dhtLookupTime = options.dhtLookupTime || 5 * 60 * 1000;
    this.noLocalhost = options.noLocalhost || false;
    
    //Parts of Node
    this.mempool = new Mempool()
    this.nodeList = new NodeList();
    this.walletManager = new WalletManager();
    this.accountCreator = new AccountCreator();
    this.chain = new Blockchain([], this.mempool);
    //Network related parameters
    this.ioServer = {};
    this.userInterfaces = [];
    this.peersConnected = {}; //From ioServer to ioClient
    this.connectionsToPeers = {}; //From ioClient to ioServer
    this.peersLatestBlocks = {}
    this.messageBuffer = {};
    this.messageBufferCleanUpDelay = 30 * 1000;
    this.peerMessageExpiration = 30 * 1000
    this.blocksToValidate = []
    this.updated = false;
    this.isDownloading = false;
    this.minerStarted = false;
    this.peerManager = new PeerManager({
      address:this.address,
      host:this.host,
      lanHost:this.lanHost,
      lanAddress:this.lanAddress,
      connectionsToPeers:this.connectionsToPeers,
      networkManager:this.networkManager,
      nodeList:this.nodeList,
      noLocalhost:this.noLocalhost,
      receiveBlockchainStatus:(peer, status)=>{
        return this.receiveBlockchainStatus(peer, status)
      },
      UILog:(...args)=>{
        return this.UILog(...args)
      },
      buildBlockchainStatus:async ()=>{
        return await this.buildBlockchainStatus()
      }
    })
    //APIs
    this.httpAPI = new HttpAPI({
      chain:this.chain,
      mempool:this.mempool,
      channel:this.minerChannel,
      nodeList:this.nodeList,
      broadcastAction:async (action)=>{
        return await this.broadcastAction(action)
      },
      broadcastTransaction:async (transaction, test)=>{
        return await this.broadcastTransaction(transaction, test)
      },
      testAction:async (action)=>{
        return await this.testAction(action)
      },
      getChainInfo:()=>{
        return this.getChainInfo()
      }
    })
    
  }

  displaySplashScreen(){
    let figlet = require('figlet')
    console.log(chalk.green(figlet.textSync('HydraChain.js')))
  }

  /**
    Boots up Node's Websocket Server and local HTTP and Wesocket APIs
  */
  startServer(){

    return new Promise(async (resolve, reject)=>{
      this.displaySplashScreen()
      console.log(chalk.cyan('\n*************************************************'))
      console.log(chalk.cyan('*')+' Starting node at '+this.address+chalk.cyan("   *"));
      console.log(chalk.cyan('*************************************************\n'))

        // process.GENESIS = this.genesis
        
        let networkConfigLoaded = await this.networkManager.init()
        if(networkConfigLoaded.error) logger("NETWORK INIT ERROR", networkConfigLoaded.error)
        let token = this.networkManager.getNetwork()
        let joined = await this.networkManager.joinNetwork(token)
        if(joined.error) logger('NETWORK ERROR', joined.error)
        console.log(this.networkManager.getNetwork())
        this.chain.init()
        .then(async (chainLoaded)=>{
            
            
            
            
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
            logger('Loaded network configurations')
            logger('Attempting to connect to network: '+this.networkManager.currentNetwork)

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
            this.initAPIs();
            // if(this.clusterMiner) this.initMinerAPI();
            
            
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
                
                    socket.on('authentication', (config)=>{
                      let verified = this.verifyNetworkConfig(config)
                      if(verified && !verified.error){
                        socket.emit('authenticated', { success:this.networkManager.getNetwork() })
                        socket.on('message', (msg) => { logger('Client:', msg); });

                        if(token && token != undefined){
                          token = JSON.parse(token)
                          let peerAddress = token.address
                          
                          if(socket.request.headers['user-agent'] === 'node-XMLHttpRequest'){  //
                            
                            if(!this.peersConnected[peerAddress]){

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
                        socket.emit('authenticated', { error:verified.error, network:this.networkManager.getNetwork() })
                        socket.disconnect()
                      }
                        
                      
                    })
                    
                
                
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

  verifyNetworkConfig(networkConfig){
    if(networkConfig && typeof networkConfig == 'object'){
      let genesisConfigHash = getGenesisConfigHash()
      let peerGenesisConfigHash = sha256(JSON.stringify(networkConfig.genesisConfig))
      let isValidPeerGenesisHash = peerGenesisConfigHash === networkConfig.genesisConfigHash
      if(!isValidPeerGenesisHash) return { error:'ERROR: Peer genesis config hash is not valid' }
      let matchesOwnGenesisConfigHash = peerGenesisConfigHash === genesisConfigHash
      if(!matchesOwnGenesisConfigHash){
        console.log('Peer',peerGenesisConfigHash)
        console.log('This',genesisConfigHash)
        return { error:"Peer's genesis config hash does not match the network's" }
      }
      return true
    }else{
      return { error:'ERROR: Need to provide valid network config' }
    }
  }

  connectToPeer(address, callback){
    return this.peerManager.connectToPeer(address, callback)
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
      socket.disconnect()
    })

    socket.on('connectionRequest', async(address)=>{
      await rateLimiter.consume(socket.handshake.address).catch(e => {  console.log("Peer sent too many 'connectionRequest' events") }); // consume 1 point per event from IP
      this.peerManager.connectToPeer(address);
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
            this.peerManager.connectToPeer(peerAddress)
            // logger('ERROR: Could not find peer socket to download blockchain')
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
              socket.emit('previousBlock', {error:`ERROR: Could not find block body of ${hash.substr(0, 10)}... at block index ${index}`})
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
                socket.emit('nextBlock', {error:`ERROR: Could not find block body of ${nextBlock.hash.substr(0, 10)}... at block index ${nextBlock.blockNumber}`})
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

  /**
   * @desc Connects to all known peer addresses
   */  
  joinPeers(){
    try{
      if(this.nodeList.addresses){
        this.nodeList.addresses.forEach((peer)=>{
          this.peerManager.connectToPeer(peer);
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
          this.peerManager.connectToPeer(address)
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
      logger('Looking for peers on swarm channel:', this.networkManager.currentNetwork)
      this.peerDiscovery = new PeerDiscovery({
        channel:this.networkManager.currentNetwork,
        address:this.address,
        host:this.host,
        port:this.peerDiscoveryPort,
      });
      
      this.peerDiscovery.searchDHT()
      .then(()=>{
        this.peerDiscovery.collectPeers((emitter)=>{
  
          emitter.on('peerDiscovered', (peer)=> {
            let isSameIp = extractBaseIpAddress(peer.address) == extractBaseIpAddress(this.address)
            if(!this.connectionsToPeers[peer.address] && !isSameIp){
              let { host, port, address } = peer
              if(host == this.host) host = this.lanHost
              logger('Found new peer', chalk.green(address))
              this.peerManager.connectToPeer(address)
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
          }else if(isBlockPushed.findMissing || isBlockPushed.unlinked || isBlockPushed.unlinkedExtended){
            //Received some block but it wasn't linked to any other block
            //in this chain. So, node tries to find the block to which it is linked
            //in order to swap branches if it is necessary
            let branchingAt = isBlockPushed.findMissing || isBlockPushed.unlinked || isBlockPushed.unlinkedExtended
            let fixed = await this.fixUnlinkedBranch(branchingAt);
            if(fixed.error) resolve({error:fixed.error})
            else resolve(fixed)

          }else{
            
            peer.emit('getNextBlock', block.hash)
            awaitRequest()
          }
          
        }
      })
      
      peer.emit('getNextBlock', startHash);

    })
    
  }

  async buildBlockchainStatus(){
    let latestFullBlock = await this.getLatestFullBlock()

    let status = {
      totalDifficultyHex: this.chain.getTotalDifficulty(),
      bestBlockHeader: this.chain.extractHeader(latestFullBlock),
      length: this.chain.chain.length
    }

    return status
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

                this.isDownloading = true
                let downloaded = await this.downloadBlockchain(peer, bestBlockHeader)
                this.isDownloading = false
                if(downloaded.error){
                  logger('Could not download blockchain')
                  logger(downloaded.error)
                  resolve(false)
                }else{
                  this.updated = true
                  resolve(true)
                }
               
              }else{
                console.log(bestBlockHeader)
                logger('ERROR: Last block header from peer is invalid')
                resolve(false)
              }
            }else{
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

  /**
   * @desc Checks for the peer that has the highest difficulty containing header
   */
  getMostUpToDatePeer(){
    return new Promise(async (resolve)=>{
      try{
        if(Object.keys(this.connectionsToPeers).length > 0){
          let highestTotalDifficulty = '0x001'
          let mostUpdateToDatePeer = false
          for await(let address of Object.keys(this.connectionsToPeers)){
            let peer = this.connectionsToPeers[address]
  
            let peerLatestBlock = this.peersLatestBlocks[address]
            if(peerLatestBlock){
              let totalDifficulty = BigInt(parseInt(peerLatestBlock.totalDifficulty, 16))
              if(totalDifficulty > BigInt(parseInt(highestTotalDifficulty, 16))){
                highestTotalDifficulty = peerLatestBlock.totalDifficulty
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
      }catch(e){
        resolve({error:e.message})
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
            //If branch is composed of single block, add it to an array for further
            //handling of the branch
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
            if(!unlinkedBranch) resolve({error:`ERROR: Could not find unlinked branch at hash ${unlinkedHash.substr(0, 8)}...`})
            else{
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
            
            if(unlinkedBranch){
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
            }else{
              console.log('Unlinked branch', unlinkedBranch)
              console.log('Unlinked branch on standby')
              resolve({ standby:true })
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
        else if(peer.error) resolve({error:peer.error})
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
              missingBlocks = [ block, ...missingBlocks ]

              if(isLinkedToChain){
                peer.off('previousBlock')
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
  broadcast(eventType, data, retry=false){
    try{
      if(this.connectionsToPeers){
          Object.keys(this.connectionsToPeers).forEach((peerAddress)=>{
            this.connectionsToPeers[peerAddress].emit(eventType, data, (acknowledged)=>{
              if(acknowledged){
                //If peer is malicious, could implement a way to reduce their reputation score
                //and close connection if the score is too low
              }else if(eventType == 'peerMessage' && !acknowledge){
                logger(`Peer ${peerAddress} did not acknowledge peerMessage`)
                if(!retry){
                  setTimeout(()=> {
                    //Possibly dangerous
                    logger(`Retrying to send peerMessage`)
                    this.broadcast(eventType, data, true)
                  }, 5000)
                }
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
    Socket listeners only usable by external UIs and APIs
    @param {object} $socket - Client socket connection to this node's server
  */
  externalEventHandlers(socket){
    try{
      this.userInterfaces.push(socket)
      socket.emit('message', 'Connected to local node');

      socket.on('error', (err)=> logger(chalk.red(err)))

      socket.on('connectionRequest', (address)=>{
        this.peerManager.connectToPeer(address, (peer)=>{});
      });

      socket.on('transaction',async (transaction)=>{
        try{
          if(isValidTransactionJSON(transaction) || isValidTransactionCallJSON(transaction)){
            let transactionEmitted = await this.broadcastTransaction(transaction, false)
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
          if(!block) socket.emit('contractState', { error:`Block ${blockNumber} not found` })
          else{
            let timestamp = block.timestamp
            let state = await storage.getClosestState(timestamp)
            socket.emit('contractState', state)
          }
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
          let result = await this.chain.accountTable.getAccount(name)
          socket.emit('account', result)
          console.log(result)
        }catch(e){
          socket.emit('account', { error:e.message })
        }
      })

      socket.on('getAllAccounts', async (ownerKey)=>{
        try{
          let allAccounts = await this.chain.accountTable.getAccountsOfKey(ownerKey)
          if(allAccounts){
            socket.emit('accounts', allAccounts)
          }else{
            socket.emit('accounts', {})
          }
          
        }catch(e){
          socket.emit('accounts', { error:e.message })
        }
          
          
      })

      socket.on('getChain', ()=>{
        console.log(this.chain.chain)
      })

      socket.on('getBlockHeader', (blockNumber)=>{
        let block = this.chain.chain[blockNumber];
        socket.emit('header', { header:block })
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

      socket.on('verbose', ()=>{
        
        if(this.verbose){
          this.UILog('Verbose set to OFF');
          logger('Verbose set to OFF');
          this.verbose = false;
          
        }else{
          this.UILog('Verbose set to ON');
          logger('Verbose set to ON');
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
        logger('Stopping miner')
        this.minerChannel.emit('stopMining')
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
        socket.emit('transactionFromDB', transaction)
      })

      socket.on('getActionFromDB', async (hash)=>{
        let action = await this.chain.getActionFromDB(hash)
        socket.emit('actionFromDB', action)
      })

      socket.on('disconnect', ()=>{
        var index = this.userInterfaces.length
        this.userInterfaces.splice(index-1, 1)
      })
    }catch(e){
      console.log(e);
    }
    
  }

  initAPIs(){

    let app = express()
    if(this.exposeControlPanel){
      if(this.exposeHTTP)logger('WARNING: Exposing control panel to the public')
      app.use(express.static(__dirname+'/views'));
    }
    express.json({ limit: '300kb' })
    app.use(helmet())

    this.httpAPI.initServiceAPI(app)
    this.httpAPI.initChainInfoAPI(app)

    const server = http.createServer(app)
    server.listen(this.minerPort, (this.exposeHTTP ? '' : 'localhost'));
    this.localServer = socketIo(server);

    logger('Local API accessible on ',this.minerPort)
    this.localServer.on('connection',(socket)=>{

      let token = socket.handshake.query.token;

      if(token && token == 'InitMiner'){
        this.startMinerAPI(socket)
      }else{
        socket.emit('message', 'Connected to local node');
        this.externalEventHandlers(socket)
      }
    })
   
  }

  async startMinerAPI(socket){
    logger('Miner connected')
    
    this.minerAPI = new MinerAPI({
      chain:this.chain,
      mempool:this.mempool,
      channel: this.minerChannel,
      sendPeerMessage:(type, data)=>{
        this.sendPeerMessage(type, data)
      },
      keychain:this.keychain,
      clusterMiner:this.clusterMiner,
      verbose:true,
      socket:socket
    })

    this.minerAPI.init()
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
            //   var shaInput = (Math.random() * Date.now()).toString()
            
            var message = { 
                'type':type, 
                'messageId':'', 
                'originAddress':this.address, 
                'data':data,
                'relayPeer':this.address,
                'timestamp':Date.now(),
                'expiration':Date.now() + this.peerMessageExpiration// 30 seconds
            }
            let messageId = sha1(JSON.stringify(message));
            message.messageId = messageId
            this.messageBuffer[messageId] = messageId;
            this.broadcast('peerMessage', message);

        }catch(e){
            console.log(e);
        }

    }

  }

  /**
    @param {String} $type - Peer message type
    @param {String} $originAddress - IP Address of sender
    @param {Object} $data - Various data (transactions to blockHash). Contains messageId for logging peer messages
  */
  async handlePeerMessage(peerMessage, acknowledge){
    let { type, originAddress, messageId, data, relayPeer, timestamp, expiration } = peerMessage
    if(data){
      try{

        var originalMessage = { 
            'type':type, 
            'messageId':'', 
            'originAddress':originAddress, 
            'data':data,
            'relayPeer':originAddress,
            'timestamp':timestamp,
            'expiration':expiration// 30 seconds
        }

        let isValidHash = messageId === sha1(JSON.stringify(originalMessage))
        if(isValidHash){
          if(peerMessage.timestamp <= Date.now() + this.peerMessageExpiration){
            this.messageBuffer[messageId] = peerMessage;

            acknowledge({received:messageId})
              switch(type){
                case 'transaction':
                  var transaction = JSON.parse(data);
                  this.receiveTransaction(transaction);
                  this.broadcast('peerMessage', peerMessage)
                  break;
                case 'action':
                  let action = JSON.parse(data);
                  let executed = await this.receiveAction(action);
                  if(executed.error && this.verbose) logger(chalk.red('ACTION ERROR'), executed.error)
                  this.broadcast('peerMessage', peerMessage)
                  break
                case 'newBlockFound':
                  if(!this.chain.isBusy){
                    this.chain.isBusy = true
                    this.broadcast('peerMessage', peerMessage)
                    let added = await this.handleNewBlockFound(data, originAddress, peerMessage);
                    this.chain.isBusy = false;
                    if(added){
                      if(added.error){
                        logger(chalk.red('REJECTED BLOCK:'), added.error)
                      }else if(added.busy){
                        logger(chalk.yellow('WARNING: Received block but node is busy downloading'))
                      }
  
                    }
                  }
                  break;
                
              }
              
          }else{
            logger(`Peer ${originAddress} sent an outdated peer message`)
          }
        }else{
          logger(`Peer message from ${originAddress} has an invalid hash`)
        }
        
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
  /**
    @param {Object} $action - New action emitted on the network
  */
  receiveAction(action){
    return new Promise(async (resolve)=>{
      if(!isValidActionJSON(action)) resolve({error:'ERROR: Received action of invalid format'})

      let isValid = await this.chain.validateAction(action)
      if(!isValid || isValid.error){
        if(this.verbose) logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
        resolve({error:isValid.error})
      }else{
        //Action will be added to this.mempool only is valid and if corresponds with contract call
        this.UILog('«-'+' Received valid action : '+ action.hash.substr(0, 15)+"...")
        if(this.verbose) logger(chalk.cyan('«-')+' Received valid action : '+ action.hash.substr(0, 15)+"...")
        let added = await this.mempool.addAction(action)
        resolve({action:action})
      }
    })
  }

  /**
    @desc Retrieves basic information about the current blockchain
  */
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

  /**
   * Validates than adds peers' new blocks to current blockchain
   * If mining, stops miner upon reception and confirmation of validity
   * @param {Object} data 
   * @param {String} fromPeer 
   * @param {Object} peerMessage 
   */
  handleNewBlockFound(data, fromPeer, peerMessage){
    return new Promise( async (resolve)=>{
      if(this.chain instanceof Blockchain && data){
        if(!this.isDownloading){
          try{

            let block = JSON.parse(data);
            if(!isValidBlockJSON(block)) resolve({error:'ERROR: Block is of invalid format'})
            else{
              let alreadyReceived = await this.chain.getBlockbyHash(block.hash)
              let alreadyIsInActiveBranch = this.chain.branches[block.hash];
    
              if(!alreadyReceived && !alreadyIsInActiveBranch){
                if(this.chain.validateBlockHeader(block)){
                  //Retransmit block
                  this.broadcast('peerMessage', peerMessage)
                  //Become peer's most recent block
                  this.peersLatestBlocks[fromPeer] = block

                  //Tells the miner to stop mining and stand by
                  //While node is push next block
                  this.minerChannel.emit('nodeEvent','stopMining')
                  this.minerChannel.emit('nodeEvent','isBusy')

                  //Validates than runs the block
                  let added = await this.chain.pushBlock(block);
                  if(added.error){
                    //Something failed, miner can carry on
                    this.minerChannel.emit('nodeEvent','isAvailable')
                    resolve({error:added.error})
                  }
                  else{
                    let currentLength = this.chain.length;
                    //If not linked, stop mining after pushing the block, to allow more time for mining on this node
                    let result = {}

                    if(added.findMissing || added.unlinked || added.unlinkedExtended){
                      //Received some block but it wasn't linked to any other block
                      //in this chain. So, node tries to find the block to which it is linked
                      //in order to swap branches if it is necessary
                      if(!this.isDownloading){

                        let branchingAt = added.findMissing || added.unlinked || added.unlinkedExtended
                        console.log(branchingAt)
                        let blockNumberOfBranch = branchingAt.blockNumber
                        let rolledback = await this.chain.rollbackToBlock(blockNumberOfBranch)
                        let downloadFromAddress = peerMessage.relayPeer
                        let peer = this.connectionsToPeers[downloadFromAddress]
                        peer.emit('getBlockchainStatus')
                        result = rolledback
                        
                        
                      }else{
                        return { isDownloading:true }
                      }

                     
                      // let fixed = await this.fixUnlinkedBranch(branchingAt);
                      // if(fixed.error) result = {error:fixed.error}
                      // else result = fixed

                    }else if(added.switched && added.switched.outOfSync){
                      //Something went wrong while syncing unlinked branch
                      //Rollback and update blockchain with peers'
                      let rolledback = await this.chain.rollbackToBlock(currentLength - 5)
                      this.broadcast('getBlockchainStatus')
                      result = rolledback

                    }else{
                      result = added
                    }
                    this.minerChannel.emit('nodeEvent','isAvailable')
                    resolve(result)
                  }
    
                }else{
                  resolve({error:'ERROR:New block header is invalid'})
                }
              }else{
                resolve({error:`ERROR: Block ${block.blockNumber} already received`})
              }
            }
            
          }catch(e){
            resolve({error:e.message})
          }
        }else{
          resolve({busy:'ERROR: Node is busy, could not add block'})
        }
      }else{
        resolve({error:'ERROR: Missing parameters'})
      }
    })
    
  }

  /**
   * Validates blockchain and, if not valid, rolls back to before the conflicting block
   * @param {Boolean} allowRollback 
   */
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
                      //Is a transaction call linked to read only method
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
        resolve({error:e.message})
      }
      
    })
  }

  /**
   * Simple helper function to properly convert a transaction of type call
   * to an actual call
   * @param {Transaction} transaction 
   */
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

  /**
   * Determines whether the transactions is a simple transaction, an allocation, 
   * a stake or call, and if so, what type of call
   * @param {Transaction} transaction 
   * @param {Boolean} test - Enables testing the call in VM before broadcasting it. Recommended
   */
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

  /**
   * @desc Emits all actions as peerMessages.
   * @param {Action} action 
   */
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
          //Handler will redirect action according to its type
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

  /**
   * @desc Simulates the broadcasting of an action, without adding it
   * @param {Action} action 
   */
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

  /**
   * @desc Helper function to get the latest full block, not just the header
   */
  async getLatestFullBlock(){
    let latestHeader = this.chain.getLatestBlock()
    let block = await this.chain.getBlockFromDB(latestHeader.blockNumber)
    if(!block || block.error){
      block = await this.chain.getBlockFromDB(latestHeader.blockNumber - 1)
    }

    return block
  }


  /**
   * @desc Runs when a SIGTERM event is emitted from the node instance
   *       Saves all states listed below
   */
  save(){
    return new Promise(async (resolve, reject)=>{
      try{
        let blockchainSaved = await this.chain.save()
        let savedStates = await this.chain.balance.saveBalances(this.chain.getLatestBlock());
        let savedNodeList = await this.nodeList.saveNodeList();
        let savedNetworkConfig = await this.networkManager.save()
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

  /**
   * @desc Saves all connection ports to .env file
   */
  async savePortConfig(){
    let written = await writeToFile(`
PORT=${this.port}
API_PORT=${this.minerPort}
DHT_PORT=${this.peerDiscoveryPort}
    `,'./config/.env')
    return written;
  }

  
  /**
   * @desc Saves all configs to nodesconfig file
   */
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
      this.housekeeping()
      let backUp = await this.chain.saveLastKnownBlockToDB()
      if(backUp.error) console.log('Heartbeat ERROR:', backUp.error)
    }, this.messageBufferCleanUpDelay)
  }

  housekeeping(){}

  /**
   * @desc Displays message to any client connected to local API server
   * @param {String} message 
   * @param {*} arg 
   */
  UILog(message, arg){
    if(arg){
      this.outputToUI(message, arg)
    }else{
      this.outputToUI(message)
    }
  }
}


module.exports = Node
