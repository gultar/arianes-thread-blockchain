/**
 @author: Sacha-Olivier Dulac
*/

'use strict'
/********HTTP Server and protection************/
const express = require('express');
const http = require('http');
const https = require('https')
const helmet = require('helmet');
const EventEmitter = require('events')
//*********** Websocket connection**************/
const socketIo = require('socket.io')
//************Blockchain classes****************/
const Blockchain = require('./modules/classes/blockchain/chain');
const NodeList = require('./modules/classes/tables/nodelist');
const WalletManager = require('./modules/classes/wallets/walletManager');
const AccountCreator = require('./modules/classes/accounts/accountCreator');
const PeerDiscovery = require('./modules/network/peerDiscovery');
const SSLHandler = require('./modules/network/sslHandler')
const PeerManager = require('./modules/network/peerManager')
const NetworkManager = require('./modules/network/networkManager')

let { mempool } = require('./modules/instances/mempool')
let { balance } = require('./modules/instances/tables')
let { blockchain } = require('./modules/instances/blockchain')
let { blockRuntime } = require('./modules/instances/blockRuntime')


/****************** APIs ********************* */
const MinerAPI = require('./modules/api/minerApi')
const HttpAPI = require('./modules/api/httpApi')
/****************Tools*************************/
const { 
  displayDate, 
  logger, 
  writeToFile, } = require('./modules/tools/utils');

const {
  isValidTransactionJSON,
  isValidTransactionCallJSON,
  isValidCallPayloadJSON,
  isValidActionJSON,
  isValidBlockJSON,
  isValidPeerMessageJSON
} = require('./modules/tools/jsonvalidator');
const sha256 = require('./modules/tools/sha256');
const getGenesisConfigHash = require('./modules/tools/genesisConfigHash')
const sha1 = require('sha1')
const chalk = require('chalk');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const compareSnapshots = require('./modules/network/snapshotHandler')

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
    global.minerChannel = this.minerChannel
    this.id = options.id || sha1(Math.random() * Date.now());
    this.publicKey = options.publicKey;
    this.verbose = options.verbose;
    this.enableLocalPeerDiscovery = options.enableLocalPeerDiscovery;
    this.enableDHTDiscovery = options.enableDHTDiscovery;
    this.peerDiscoveryPort = options.peerDiscoveryPort || '6000';
    this.dhtLookupTime = options.dhtLookupTime || 5 * 60 * 1000;
    this.noLocalhost = options.noLocalhost || false;
    
    this.nodeList = new NodeList();
    this.walletManager = new WalletManager();
    this.accountCreator = new AccountCreator();
    // blockchain = new Blockchain();
    this.chain = blockchain
    //Network related parameters
    this.ioServer = {};
    this.userInterfaces = [];
    this.peersConnected = {}; //From ioServer to ioClient
    this.connectionsToPeers = {}; //From ioClient to ioServer
    this.peersLatestBlocks = {}
    this.messageBuffer = {};
    this.messageBufferCleanUpDelay = 30 * 1000;
    this.messageBufferSize = options.messageBufferSize || 30
    this.peerMessageExpiration = 30 * 1000
    this.isDownloading = false;
    this.autoRollback = true || options.autoRollback || false;
    this.maximumAutoRollback = 30
    this.networkPassword = options.networkPassword
    //Peer Manager
    this.peerManager = new PeerManager({
      address:this.address,
      host:this.host,
      lanHost:this.lanHost,
      lanAddress:this.lanAddress,
      connectionsToPeers:this.connectionsToPeers,
      networkManager:this.networkManager,
      nodeList:this.nodeList,
      noLocalhost:this.noLocalhost,
      networkPassword:this.networkPassword,
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
      chain:blockchain,
      mempool:mempool,
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


  /**
    Boots up Node's Websocket Server and local HTTP and Wesocket APIs
  */
  startServer(){

    return new Promise(async (resolve, reject)=>{
        let networkConfigLoaded = await this.networkManager.init()
        if(networkConfigLoaded.error) logger("NETWORK INIT ERROR", networkConfigLoaded.error)
        let token = this.networkManager.getNetwork()
        let joined = await this.networkManager.joinNetwork(token)
        
        if(joined.error) logger('NETWORK ERROR', joined.error)

        let nodeListLoaded = await this.nodeList.loadNodeList();
        let mempoolLoaded = await mempool.loadMempool();
        let contractTableStarted = await blockRuntime.contractTable.init()
        
        if(!nodeListLoaded) reject('Could not load node list')
        if(!mempoolLoaded) reject('Could not load mempool');

        logger('Loaded Blockchain'); 
        logger('Loaded peer node list');
        logger('Loaded transaction mempool');
        logger('Number of transactions in pool: '+ await mempool.sizeOfPool());
        logger('Number of actions in pool: '+ await mempool.sizeOfActionPool());
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

        logger(chalk.cyan(`Started Blockchain node port: ${this.address}`));

        this.heartbeat();
        this.initAPIs();
        
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
            
                socket.on('authentication', (config, password)=>{
                  let verified = this.verifyNetworkConfig(config, password)
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
  }

  verifyNetworkConfig(networkConfig, password){
    if(networkConfig && typeof networkConfig == 'object'){
      let genesisConfigHash = getGenesisConfigHash()
      let peerGenesisConfigHash = sha256(JSON.stringify(networkConfig.genesisConfig))
      let isValidPeerGenesisHash = peerGenesisConfigHash === networkConfig.genesisConfigHash
      if(!isValidPeerGenesisHash) return { error:'ERROR: Peer genesis config hash is not valid' }

      if(password && this.genesis.passwordHash){
        let isValid = sha256(sha256(networkConfig.password)) === sha256(this.genesis.passwordHash)
        console.log('Is valid', recalculated)
        console.log('This', sha256(this.genesis.passwordHash))
        console.log('Peer', sha256(sha256(networkConfig.password)))
      }

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
      const rateLimiter = new RateLimiterMemory({
          points: 100, // 5 points
          duration: 1, // per second
      });

      socket.on('getBlockHeader', async (blockNumber)=> await this.getBlockHeader(socket, blockNumber))
      socket.on('getBlock', async (blockNumber, hash)=> await this.getBlock(socket, blockNumber, hash))
      socket.on('getNextBlock', async (hash)=> await this.getNextBlock(socket, hash))
      socket.on('getBlockFromHash', async(hash)=> await this.getBlockFromHash(socket, hash))
      socket.on('getBlockchainStatus', async(peerStatus)=> await this.getBlockchainStatus(socket, peerStatus, peerAddress))
      
      socket.on('error', async(err)=> logger('Socket error:',err))

      socket.on('disconnect', async()=>{ 
        logger(`Peer ${peerAddress} has disconnected from node`);
        delete this.peersConnected[peerAddress];
        socket.disconnect()
      })

      socket.on('connectionRequest', async(address)=>{
        await rateLimiter.consume(socket.handshake.address).catch(e => {  console.log("Peer sent too many 'connectionRequest' events") }); // consume 1 point per event from IP
        this.peerManager.connectToPeer(address);
      });

      socket.on('getChainSnapshot', async ()=>{
        await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getChainSnapshot' events") }); // consume 1 point per event from IP
        socket.emit('chainSnapshot', blockchain.chainSnapshot)
      })

      socket.on('peerMessage', async(peerMessage, acknowledge)=>{
        if(!this.messageBuffer[peerMessage.messageId]){
          await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'peerMessage' events") }); // consume 1 point per event from IP
          
          this.handlePeerMessage(peerMessage, acknowledge);
        }
      })

      socket.on('getGenesisBlock', async ()=>{
        await rateLimiter.consume(socket.handshake.address).catch(e => { 
          // console.log("Peer sent too many 'getNextBlock' events") 
        }); // consume 1 point per event from IP
        let genesisBlock = await blockchain.getGenesisBlockFromDB()
        socket.emit('genesisBlock', genesisBlock)
      })

    }
  }

  async getNextBlock(socket, hash){
    if(hash){
      // await rateLimiter.consume(socket.handshake.address).catch(e => { 
      //   // console.log("Peer sent too many 'getNextBlock' events") 
      // }); // consume 1 point per event from IP
      let index = await blockchain.getIndexOfBlockHashInChain(hash)
      let isGenesis = this.genesis.hash == hash
      
      if(!index && !isGenesis) socket.emit('nextBlock', {error:'Block not found'})
      else{
        if(hash == blockchain.getLatestBlock().hash){
          socket.emit('nextBlock', {end:'End of blockchain'})
        }else{
          
          let nextBlock = await blockchain.getNextBlockbyHash(hash)
          let latestBlock = blockchain.getLatestBlock()
          if(!nextBlock) socket.emit('nextBlock', { error:'ERROR: Next block not found' })
          else{
            let block = await blockchain.getBlockFromDB(nextBlock.blockNumber)
            if(!block) setTimeout(async()=>{ block = await blockchain.getBlockFromDB(nextBlock.blockNumber) }, 500)
            if(block && !block.error){
              socket.emit('nextBlock', block)
            }else{
              
              let isBeforeLastBlock = nextBlock.blockNumber >= latestBlock.blockNumber - 1
              if(isBeforeLastBlock){
                socket.emit('nextBlock', { end:'End of blockchain' })
              }else{
                socket.emit('nextBlock', { error:`ERROR: Block ${block.blockNumber} of hash ${block.hash.substr(0, 8)} not found` })
              }
              
            }
          }
        }
      }
      
    }
  }

  async getBlockFromHash(socket, hash){
    // await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockFromHash' events") }); // consume 1 point per event from IP
      if(hash && typeof hash == 'string'){
        
        let block = await blockchain.getBlockFromDBByHash(blockIndex);
          if(block){
            if(block.error) socket.emit('blockFromHash', {error:block.error})
            else socket.emit('blockFromHash', block)
            
          }else{
            socket.emit('blockFromHash', {error:'Block not found'})
          }
        
      }
  }

  async getBlock(socket, blockNumber, hash){
    // await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlock' events") });
      if(blockNumber && typeof blockNumber == 'number'){
        let block = await blockchain.getBlockFromDB(blockNumber);
        if(block){
          socket.emit('block', block)
        }else if(blockNumber >= blockchain.getLatestBlock().blockNumber + 1){
          socket.emit('block', {end:'End of block chain'})
        }else{
          socket.emit('block', {error:'Block not found'})
        }
        
      }
  }

  async getBlockHeader(socket, blockNumber){
    // await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockHeader' events") });
      if(blockNumber && typeof blockNumber == 'number'){
        let header = await blockchain.getBlockHeader(blockNumber);
        if(header){
          socket.emit('blockHeader', header)
        }else if(blockNumber == blockchain.getLatestBlock().blockNumber + 1){
          socket.emit('blockHeader', {end:'End of header chain'})
        }else{
          socket.emit('blockHeader', {error:'Header not found'})
        }
      }
  }

  async getBlockchainStatus(socket, peerStatus, peerAddress){
    // await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockchainStatus' events") }); // consume 1 point per event from IP
    try{
      let status = {
        totalDifficultyHex: blockchain.getTotalDifficulty(),
        bestBlockHeader: blockchain.getLatestBlock(),
        length: blockchain.chain.length
      }

      socket.emit('blockchainStatus', status);
      let peer = this.connectionsToPeers[peerAddress];
      if(!peer) this.peerManager.connectToPeer(peerAddress)
      
      let updated = await this.receiveBlockchainStatus(peer, peerStatus)
      if(updated && updated.error) socket.emit('blockchainStatus', { error:updated.error })
      
    }catch(e){
      console.log(e)
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
      logger(chalk.cyan(`DHT Discovery service listening on port: ${this.httpPrefix}://${this.host}:${this.peerDiscoveryPort}`))
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
  

  downloadBlockchain(peer){
    return new Promise(async (resolve)=>{
      if(peer){
        let startHash = blockchain.getLatestBlock().hash;
        this.isDownloading = true;
        let unansweredRequests = 0;
        let maxRetryNumber = 3
        this.retrySending = null;
        let rolledBack = 0
        
        const awaitRequest = () =>{
          if(unansweredRequests <= maxRetryNumber){
            this.retrySending = setTimeout(()=>{
              
              peer.emit('getNextBlock', blockchain.getLatestBlock().hash)
              unansweredRequests++
              awaitRequest()
            }, 5000)
          }else{
            logger('Blockchain download failed. No answer')
            closeConnection()
          }
        }

        const closeConnection = (error=false) =>{
          peer.off('nextBlock')
          if(!error) setTimeout(()=> this.minerChannel.emit('nodeEvent', 'finishedDownloading'), 500)
          this.isDownloading = false;
        }

        peer.on('nextBlock', async (block)=>{
          unansweredRequests = 0
          clearTimeout(this.retrySending)
          if(block.end){
            logger('Blockchain updated successfully!')
            closeConnection()
            resolve(true)
          }else if(block.error && block.error !== 'Block not found'){
            closeConnection({ error:true })
            resolve({ error: block.error })
          }else if(block.error && block.error == 'Block not found'){

            if(this.autoRollback && rolledBack <= this.maximumAutoRollback){
              rolledBack++
              let blockNumber = blockchain.getLatestBlock().blockNumber
              let rolledback = await blockRuntime.rollback(blockNumber - 1)
              let latestHash = blockchain.getLatestBlock().hash
              peer.emit('getNextBlock', latestHash)
            }else{
              closeConnection({ error:true })
              resolve({ error: block.error })
            }
            
          }else{
            let added = await this.addBlock(block)
            if(added.error){
              logger('DOWNLOAD', added.error)
              closeConnection()
            }else if(added.extended){
              let rolledback = await blockRuntime.rollback(blockchain.getLatestBlock().blockNumber - 1)
              let latestHash = blockchain.getLatestBlock().hash
              peer.emit('getNextBlock', latestHash)
              awaitRequest()
            }else{
              peer.emit('getNextBlock', block.hash)
              awaitRequest()
            }
          }
        })
        
        peer.emit('getNextBlock', startHash);
      }else{
        resolve(true)
      }

    })
    
  }

  async buildBlockchainStatus(){
    let latestFullBlock = await this.getLatestFullBlock()

    let status = {
      totalDifficultyHex: blockchain.getTotalDifficulty(),
      bestBlockHeader: blockchain.extractHeader(latestFullBlock),
      length: blockchain.chain.length
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
      if(peer && status){
        if(this.isDownloading){
          resolve(true)
        }else{
          let { totalDifficultyHex, bestBlockHeader, length } = status;
          

          if(totalDifficultyHex && bestBlockHeader && length){
            
            this.peersLatestBlocks[peer.io.uri] = bestBlockHeader
            let thisTotalDifficultyHex = await blockchain.getTotalDifficulty();
            // Possible major bug, will not sync if chain is longer but has different block at a given height
            let totalDifficulty = BigInt(parseInt(totalDifficultyHex, 16))
            let thisTotalDifficulty =  BigInt(parseInt(thisTotalDifficultyHex, 16))
            if(thisTotalDifficulty < totalDifficulty){
              logger('Attempting to download blocks from peer')
              
              let isValidHeader = await blockchain.validateBlockHeader(bestBlockHeader);
              if(isValidHeader){

                this.isDownloading = true
                let downloaded = await this.downloadBlockchain(peer, bestBlockHeader)
                this.isDownloading = false
                if(downloaded.error){
                  logger('Could not download blockchain')
                  logger(downloaded.error)
                  resolve({ error:'ERROR: Could not download blockchain' })
                }else{
                  // this.updated = true
                  resolve(true)
                }
               
              }else{
                resolve({ error:'ERROR: Last block header from peer is invalid' })
              }
            }else{
              resolve(true)
            }
  
            
  
          }else{
            resolve({ error:'ERROR: Status object is missing parameters' })
          }
        }
        
      }else{
        resolve({ error:'ERROR: Cannot receive status without peer or status' })
      }
    })
    
  }

  /**
   * @desc Checks for the peer that has the highest difficulty containing header
   */
  getMostUpToDatePeer(){
    return new Promise(async (resolve)=>{
      try{
        if(Object.keys(this.connectionsToPeers).length === 0){
          resolve(false)
        }else{
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
  
          if(mostUpdateToDatePeer) resolve(mostUpdateToDatePeer)
          else resolve(false)
        }
      }catch(e){
        resolve({error:e.message})
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
        this.peerManager.connectToPeer(address);
      });

      socket.on('getMessageBuffer', ()=>{
        socket.emit('messageBuffer', this.messageBuffer)
      })

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
          let contract = await blockRuntime.contractTable.getContract(name)
          console.log(contract)
      })

      socket.on('getContractState', async (blockNumber, contractName)=>{
        let storage = await blockRuntime.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          if(!blockNumber) blockNumber = blockchain.getLatestBlock().blockNumber;
          let block = blockchain.chain[blockNumber]
          let timestamp = block.timestamp
          let state = await storage.getClosestState(timestamp)
          socket.emit('contractState', state)
        }
      })

      socket.on('getCurrentContractState', async (contractName)=>{
        
        let storage = await blockRuntime.contractTable.stateStorage[contractName]
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
        
        let storage = await blockRuntime.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          let state = await storage.getClosestState(blockNumber)
          socket.emit('contractState', state)
          console.log(JSON.stringify(state, null, 2))
        }
      })

      socket.on('getLatestContractState', async (contractName, blockNumber)=>{
        
        let storage = await blockRuntime.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          let block = blockchain.chain[blockNumber]
          if(!block) socket.emit('contractState', { error:`Block ${blockNumber} not found` })
          else{
            let timestamp = block.timestamp
            let state = await storage.getClosestState(timestamp)
            socket.emit('contractState', state)
          }
        }
      })

      socket.on('getContractAPI', async (name)=>{
          let contract = await blockRuntime.contractTable.getContract(name)
          if(contract){
            let api = contract.contractAPI;
            socket.emit('api', api)
          }else{
            socket.emit('api', 'Not Found')
          }
          
      })

      socket.on('getAccount', async (name)=>{
        try{
          let result = await blockchain.accountTable.getAccount(name)
          socket.emit('account', result)
          console.log(result)
        }catch(e){
          socket.emit('account', { error:e.message })
        }
      })

      socket.on('getAllAccounts', async (ownerKey)=>{
        try{
          let allAccounts = await blockchain.accountTable.getAccountsOfKey(ownerKey)
          if(allAccounts){
            socket.emit('accounts', allAccounts)
          }else{
            socket.emit('accounts', {})
          }
          
        }catch(e){
          socket.emit('accounts', { error:e.message })
        }
          
          
      })

      socket.on('getBlockHeader', (blockNumber)=>{
        let block = blockchain.chain[blockNumber];
        socket.emit('header', { header:block })
      })

      socket.on('getBlock', async(blockNumber)=>{
        let block = await blockchain.getBlockFromDB(blockNumber)
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
        let block = await blockchain.getBlockFromDB(blockNumber)
        socket.emit('blockSize', require('json-size')(block))
        
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

      socket.on('getMempool', async ()=>{
        socket.emit('mempool', { transactions:mempool.txReceipts, actions:mempool.actionReceipts });
      })

      socket.on('stopMining', ()=>{
        logger('Stopping miner')
        this.minerChannel.emit('stopMining')
      })

      socket.on('getSnapshot', ()=>{
        socket.emit('chainSnapshot', blockchain.chainSnapshot)
      })

      socket.on('rollback', async (number)=>{
        let rolledback = await blockRuntime.rollback(number)
      
        socket.emit('rollbackResult', rolledback)
      })

      socket.on('getTransactionFromDB', async (hash)=>{
        // let start = process.hrtime()
        let transaction = await blockchain.getTransactionFromDB(hash)
        // let hrend = process.hrtime(start)
        // console.info('Transaction from db: %ds %dms', hrend[0], hrend[1] / 1000000)
        socket.emit('transactionFromDB', transaction)
      })

      socket.on('getActionFromDB', async (hash)=>{
        
        let action = await blockchain.getActionFromDB(hash)
        
        socket.emit('actionFromDB', action)
      })

      socket.on('checkDoubleSpend', async ()=>{
        let txHashes = {}
        let doubleSpend = {}
        for await(let block of blockchain.chain){
          if(block.blockNumber !== 0){
            for await(let hash of block.txHashes){
              if(txHashes[hash]){
                doubleSpend[hash] = block.blockNumber
              }
              else txHashes[hash] = block.blockNumber
            }
          }
        }

        console.log('Contains those double spent transactions:')
        console.log(doubleSpend)
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

    logger(chalk.cyan(`Local API accessible on port: ${this.httpPrefix}://${this.host}:${this.minerPort}`))
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

  /**
   * @desc Starts an socket server for either block miners, validators or producers
   * to interact with the node
   * @param {Socket} socket 
   */
  async startMinerAPI(socket){
    logger('Miner connected')
    
    this.minerAPI = new MinerAPI({
      chain:blockchain,
      addBlock:async (newBlock)=>{
        return await this.addBlock(newBlock)
      },
      mempool:mempool,
      channel: this.minerChannel,
      sendPeerMessage:(type, data)=>{
        this.sendPeerMessage(type, data)
      },
      broadcast:(type, data)=>{
        this.broadcast(type, data)
      },
      keychain:this.keychain,
      clusterMiner:this.clusterMiner,
      verbose:true,
      socket:socket
    })

    this.minerAPI.init()
  }

  async handleNetworkEvent(peerMessage){
    this.localServer.sockets.emit('networkEvent', peerMessage)
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
   * @desc Validates and add peer message to buffer, then route peer message accordingly
   * @param {String} $type - Peer message type
   * @param {String} $originAddress - IP Address of sender
   * @param {Object} $data - Various data (transactions to blockHash). Contains messageId for logging peer messages
  */
  async handlePeerMessage(peerMessage, acknowledge, extend){
    
    if(isValidPeerMessageJSON(peerMessage)){
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
              
              peerMessage.relayPeer = this.address
              this.addToMessageQueue(peerMessage)
              acknowledge({received:messageId})
              await this.definePeerMessageTypes(peerMessage)
                
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
    
  }

  /**
   * Properly route peer message once is has been validated
   * @param {Object} peerMessage 
   */
  async definePeerMessageTypes(peerMessage){
    let { type, data, relayPeer } = peerMessage
    switch(type){
      case 'transaction':
        var transaction = JSON.parse(data);
        let executedTx = await this.receiveTransaction(transaction);
        if(executedTx.error && this.verbose) logger(chalk.red('TRANSACTION ERROR'), executedTx.error)
        else this.broadcast('peerMessage', peerMessage)
        break;
      case 'action':
        let action = JSON.parse(data);
        let executedAction = await this.receiveAction(action);
        if(executedAction.error && this.verbose) logger(chalk.red('ACTION ERROR'), executedAction.error)
        else this.broadcast('peerMessage', peerMessage)
        break
      case 'newBlockFound':
        this.broadcast('peerMessage', peerMessage)
          let added = await this.handleNewBlockFound(data, relayPeer, peerMessage);
          if(added){
            if(added.error) logger(chalk.red('REJECTED BLOCK:'), added.error)
            else if(added.busy) logger(chalk.yellow('WARNING: Received block but node is busy downloading'))
          }
        break;
      case 'networkEvent':
        await this.handleNetworkEvent(peerMessage)
        break;
      
    }
  }

  /**
   * @desc Receive new transaction
    @param {Transaction} $transaction - New transaction emitted on the network
  */
  receiveTransaction(transaction){
    return new Promise((resolve)=>{
      if(transaction && blockchain instanceof Blockchain){
        if(isValidTransactionJSON(transaction) || isValidTransactionCallJSON(transaction)){
  
          blockchain.validateTransaction(transaction)
          .then(async (valid) => {
            if(!valid.error){
              await mempool.addTransaction(transaction);
              this.UILog('<-'+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
              if(this.verbose) logger(chalk.green('<-')+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
              resolve(valid)
            }else{
              this.UILog('!!!'+' Received invalid transaction : '+ transaction.hash.substr(0, 15)+"...")
              if(this.verbose) logger(chalk.red('!!!'+' Received invalid transaction : ')+ transaction.hash.substr(0, 15)+"...")
              resolve({error:valid.error})
            }
          })
        }
      }
    })
  }

  /**
   * @desc Receive receive new action
   *@param {Action} $action - New action emitted on the network
  */
  receiveAction(action){
    return new Promise(async (resolve)=>{
      if(!isValidActionJSON(action)) resolve({error:'ERROR: Received action of invalid format'})

      let isValid = await blockchain.validateAction(action)
      if(!isValid || isValid.error){
        if(this.verbose) logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
        resolve({error:isValid.error})
      }else{
        //Action will be added to mempool only is valid and if corresponds with contract call
        this.UILog('«-'+' Received valid action : '+ action.hash.substr(0, 15)+"...")
        if(this.verbose) logger(chalk.cyan('«-')+' Received valid action : '+ action.hash.substr(0, 15)+"...")
        await mempool.addAction(action)
        resolve({action:action})
      }
    })
  }

  /**
    @desc Retrieves basic information about the current blockchain
  */
  getChainInfo(){
    let info = {
      chainLength:blockchain.chain.length,
      headBlockNumber:blockchain.getLatestBlock().blockNumber,
      headBlockHash:blockchain.getLatestBlock().hash,
      lastBlockTime:displayDate(new Date(blockchain.getLatestBlock().timestamp)),
      totalDifficulty:blockchain.getTotalDifficulty(),
      minedBy:blockchain.getLatestBlock().minedBy,
    }
    return info
  }

  /**
   * @desc Validates than adds peers' new blocks to current blockchain
   * If mining, stops miner upon reception and confirmation of validity
   * @param {Object} data 
   * @param {String} fromPeer 
   * @param {Object} peerMessage 
   */
  handleNewBlockFound(data, relayPeer, peerMessage){
    return new Promise( async (resolve)=>{
      if(data){
        if(!this.isDownloading){
          try{

            let block = JSON.parse(data);
            if(!isValidBlockJSON(block)) resolve({error:'ERROR: Block is of invalid format'})
            else{
              let alreadyReceived = await blockchain.getBlockbyHash(block.hash)
    
              if(!alreadyReceived){
                if(blockchain.validateBlockHeader(block)){
                  //Retransmit block
                  this.broadcast('peerMessage', peerMessage)
                  //Become peer's most recent block
                  this.peersLatestBlocks[relayPeer] = block

                  //Tells the miner to stop mining and stand by
                  //While node is push next block
                  this.minerChannel.emit('nodeEvent','stopMining')
                  this.minerChannel.emit('nodeEvent','isBusy')
                  //Validates than runs the block
                  let added = await this.addBlock(block);

                  this.minerChannel.emit('nodeEvent','isAvailable')
                  let handled = await this.handleBlockReception(added)
                  let executed = await this.executeBlock()
                  
                  resolve(handled)
    
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
   * @desc Handles the outcome of adding next block
   * @param {Object} reception 
   */
  handleBlockReception(reception){
    return new Promise(async (resolve)=>{
      if(reception.error) resolve({error:reception.error})
      else if(reception.requestUpdate){
        
        let peer = await this.getMostUpToDatePeer()
        let updated = await this.downloadBlockchain(peer, blockchain.getLatestBlock())
        if(updated.error) resolve({error:updated.error})
        else resolve(updated)
        resolve({ updating:true })

      }
      else if(reception.rollback){

        let peer = await this.getMostUpToDatePeer()
        let rolledBack = await blockRuntime.rollback(reception.rollback)
        if(rolledBack.error) resolve({error:rolledBack.error})
        let lastHeader = blockchain.getLatestBlock()
        let downloaded = await this.downloadBlockchain(peer, lastHeader)
        resolve(downloaded)
        
      }
      else if(reception.extended){
        logger('Comparing chain snapshots with peer', peer.address)
        let peer = await this.getMostUpToDatePeer()

        if(peer){
          let snapshot = this.peerManager.getSnapshot(peer.address)
          
          let comparison = await compareSnapshots(blockchain.chainSnapshot, snapshot)
          if(comparison.rollback){
            logger('Peer chain has a longer branch than this node')
            let rolledBack = await blockRuntime.rollback(comparison.rollback)
            if(rolledBack.error) resolve({error:rolledBack.error})

            let lastHeader = blockchain.getLatestBlock()
            let downloaded = await this.downloadBlockchain(peer, lastHeader)
            resolve(downloaded)
          }else if(comparison.merge){
            logger("Need to merge peer's branched block")
            let blockNumber = comparison.merge.hash
            let rolledBack = await blockRuntime.rollback(blockNumber - 1)
            if(rolledBack.error) resolve({error:rolledBack.error})

            let lastHeader = blockchain.getLatestBlock()
            let downloaded = await this.downloadBlockchain(peer, lastHeader)
            resolve(downloaded)
          }else{
            logger("This chain snapshot is longer")
            resolve(comparison)
          }
        }else{
          resolve({error:'ERROR: Could not find suitable peer to sync with'})
        }
        

      }else{
        resolve(reception)
      }
    })
  }

  async addBlock(newBlock){
    let received = await blockchain.receiveBlock(newBlock)
    if(received.readyToExecute){
      let executed = await blockRuntime.executeBlock(newBlock)
      if(executed.error) return { error:executed.error }

      return { blockAdded:true }
    }else{
      return received
    }
  }

  /**
   * @desc Validates blockchain and, if not valid, rolls back to before the conflicting block
   * @param {Boolean} allowRollback 
   */
  async validateBlockchain(allowRollback){
    if(blockchain instanceof Blockchain){
      let isValid = await blockchain.isChainValid();
      if(isValid.conflict){
        let atBlockNumber = isValid.conflict;
        if(allowRollback){
          let rolledback = await blockRuntime.rollback(atBlockNumber-1);
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
       if(blockchain instanceof Blockchain){
         var latestBlock = blockchain.chain[number];
         var indexBeforeThat = latestBlock.blockNumber-1;
         var blockBeforeThat = blockchain.chain[indexBeforeThat];
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
        if(!transaction.signature){
          logger('Transaction signature failed. Missing signature')
          resolve({error:'Transaction signature failed. Missing signature'})
        }else{
          
          blockchain.createTransaction(transaction)
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
          let contract = await blockRuntime.contractTable.getContract(call.data.contractName)
          //Checking if the method invoked is open to external execution
          let contractAPI = contract.contractAPI
          if(!contractAPI) resolve({ error:'ERROR: Contract does not have an API' })
          
          let contractMethod = contractAPI[call.data.method];
          
          if(!contractMethod) resolve({error:'ERROR Unknown contract method'})
          else{
            if(contractMethod.type == 'get'){
              //'Get' methods dont modify contract state, obviously
              let result = await blockRuntime.testCall(call)
              if(result.error) resolve({error:result.error})
              else if(result){
                resolve({ isReadOnly:result , call:call} )
              }
    
            }else if(contractMethod.type == 'set'){
              //'Set' method may modify state.
              if(test){
                let result = await blockRuntime.testCall(call)
              
                if(result.error) resolve({error:result.error})
                else{
                  //Transactions added to pool for confirmation by peers blocks or by this
                  //node's blocks. 
                  let added = await mempool.addTransaction(transaction);
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
                let added = await mempool.addTransaction(transaction);
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
        }else if(transaction.type == 'payable'){
          resolve({error:'ERROR: Payables may only be created from within a contract'})
        }else if(transaction.type == 'Contract Action'){
          resolve({error:'ERROR: Contract actions may only be created from within a contract'})
        }else{
          //Simple transaction
          let added = await mempool.addTransaction(transaction);
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
        let isValid = await blockchain.validateAction(action)
        if(!isValid || isValid.error){
          if(this.verbose) logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
          resolve({error:isValid.error})
        }else{
          //Handler will redirect action according to its type
          let success = await blockRuntime.testHandleAction(action)
          if(success.error) resolve({error:success.error})
          else if(!success.error){
            if(success.isReadOnly){
              resolve({isReadOnly:true, action:action, success:success.isReadOnly})
            }else{
              this.sendPeerMessage('action', JSON.stringify(action, null, 2)); //Propagate action
              //Action will be added to mempool only is valid and if corresponds with contract call
              if(this.verbose) logger(chalk.blue('-»')+' Emitted action: '+ action.hash.substr(0, 15)+"...")
              let added = await  mempool.addAction(action)
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

      let isValid = await blockchain.validateAction(action)
      if(!isValid || isValid.error){
        resolve({error:isValid.error})
      }else{
        let result = await blockRuntime.testHandleAction(action)
        if(result.error) resolve({error:result.error})
        else resolve({action:action, result:result})
      }
        
    })
  }

  /**
   * @desc Helper function to get the latest full block, not just the header
   */
  async getLatestFullBlock(){
    let latestHeader = blockchain.getLatestBlock()
    let block = await blockchain.getBlockFromDB(latestHeader.blockNumber)
    if(!block || block.error){
      block = await blockchain.getBlockFromDB(latestHeader.blockNumber - 1)
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
        let blockchainSaved = await blockchain.save()
        let savedStates = await balance.saveBalances(blockchain.getLatestBlock());
        let savedNodeList = await this.nodeList.saveNodeList();
        let savedNetworkConfig = await this.networkManager.save()
        let savedMempool = await mempool.saveMempool();
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
   * @desc Add new peer messages to queue and removes older ones when it reaches it
   * maximum size
   * @param {Object} peerMessage 
   */
  addToMessageQueue(peerMessage){
    this.messageBuffer[peerMessage.messageId] = peerMessage
    let messageIds = Object.keys(this.messageBuffer)
    if(messageIds.length > this.messageBufferSize){
      let firstId = messageIds[0]
      delete this.messageBuffer[firstId]

    }
  }

  /**
    @desc Routine tasks go here. The heartbeat's delay is adjusted in nodeconfig
  */
  heartbeat(){
    setInterval(async ()=>{
      blockchain.save()
      this.housekeeping()
      this.broadcast('getChainSnapshot')
      let backUp = await blockchain.saveLastKnownBlockToDB()
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
