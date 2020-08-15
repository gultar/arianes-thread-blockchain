/**
 TFLB | Thousandfold Blockchain
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
const Mempool = require('./modules/classes/mempool/pool');
const PeerManager = require('./modules/network/peerManager')
const NetworkManager = require('./modules/network/networkManager')
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
  isValidHeaderJSON,
  isValidBlockchainStatusJSON
} = require('./modules/tools/jsonvalidator');
const sha256 = require('./modules/tools/sha256');
const getGenesisConfigHash = require('./modules/tools/genesisConfigHash')
const sha1 = require('sha1')
const chalk = require('chalk');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const nodeDebug = require('debug')('node')
// const compareSnapshots = require('./modules/network/snapshotHandler');
const Database = require('./modules/classes/database/db');
const { down } = require('inquirer/lib/utils/readline');

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
    this.lastThreeSyncs = []
    this.messageBuffer = {};
    this.messageBufferCleanUpDelay = 30 * 1000;
    this.synchronizeDelay = 2*1000;
    this.messageBufferSize = options.messageBufferSize || 30
    this.peerMessageExpiration = 30 * 1000
    this.isDownloading = false;
    this.autoRollback = true || options.autoRollback;
    this.tolerableBlockGap = 1 // blocks
    this.maximumAutoRollback = 10
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
        return this.buildBlockchainStatus()
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
    // let figlet = require('figlet')
    // console.log(chalk.green(figlet.textSync('HydraChain.js')))
  }

  /**
    Boots up Node's Websocket Server and local HTTP and Wesocket APIs
  */
  startServer(){

    return new Promise(async (resolve, reject)=>{
      
      console.log(chalk.cyan('\n*************************************************'))
      console.log(chalk.cyan('*')+' Starting node at '+this.address+chalk.cyan("   *"));
      console.log(chalk.cyan('*************************************************\n'))

        let networkConfigLoaded = await this.networkManager.init()
        if(networkConfigLoaded.error) logger("NETWORK INIT ERROR", networkConfigLoaded.error)
        let token = this.networkManager.getNetwork()
        let joined = await this.networkManager.joinNetwork(token)
        if(joined.error) logger('NETWORK ERROR', joined.error)
        
        this.chain.init()
        .then(async ()=>{
          
            let nodeListLoaded = await this.nodeList.loadNodeList();
            let mempoolLoaded = await this.mempool.loadMempool();
            
            if(!nodeListLoaded) reject('Could not load node list')
            if(!mempoolLoaded) reject('Could not load mempool');

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
            let loadedReputations = await this.peerManager.reputationTable.loadReputations()
            if(loadedReputations.error) logger('REPUTATION',loadedReputations.error)
            this.heartbeat();
            nodeDebug('Started heartbeat cycle')
            this.syncHeartBeat();
            nodeDebug('Started sync heartbeat cycle')
            this.initAPIs();
            nodeDebug('Started HTTP API and Miner API')

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
                      nodeDebug('Received authentication request from peer')
                      let verified = this.verifyNetworkConfig(config)
                      if(verified && !verified.error){
                        socket.emit('authenticated', { success:this.networkManager.getNetwork() })
                        nodeDebug('Authenticated peer')
                        
                        socket.on('message', (msg) => { logger('Client:', msg); });

                        if(token && token != undefined){
                          token = JSON.parse(token)
                          let peerAddress = token.address
                          
                          if(socket.request.headers['user-agent'] === 'node-XMLHttpRequest'){  //
                            
                            if(!this.peersConnected[peerAddress]){

                              this.peersConnected[peerAddress] = socket;
                              this.nodeList.addNewAddress(peerAddress);
                              nodeDebug(`Added peer ${peerAddress} to node list`)
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

  connectToPeer(address){
    return this.peerManager.connectToPeer(address)
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
      socket.on('getStatus', async ()=> socket.emit('status', this.buildBlockchainStatus()))
      socket.on('getBlockHeader', async (blockNumber)=> await this.getBlockHeader(socket, blockNumber))
      socket.on('getBlock', async (blockNumber, hash)=> await this.getBlock(socket, blockNumber, hash))
      socket.on('getNextBlock', async (header)=> await this.getNextBlock(socket, header))
      socket.on('getAllContractStates', async(blockNumber)=> await this.getAllContractStates(socket, blockNumber))
      socket.on('getBlockFromHash', async(hash)=> await this.getBlockFromHash(socket, hash))
      socket.on('getBlockchainStatus', async(peerStatus)=> await this.getBlockchainStatus(socket, peerStatus))
      socket.on('getPeers', async() =>{ await this.getPeers(socket) })
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

      socket.on('peerMessage', async(peerMessage, acknowledge)=>{
        if(!this.messageBuffer[peerMessage.messageId]){
          await rateLimiter.consume(socket.handshake.address).catch(async( e ) => { 
              let lowered = await this.peerManager.lowerReputation(peerAddress, 'spammed')
              console.log('Is Socket',lowered)
          }); // consume 1 point per event from IP
          nodeDebug(`SOCKET: Received a peer message from ${peerAddress}`)
          nodeDebug('SOCKET: Message:', peerMessage)
          this.handlePeerMessage(peerMessage, acknowledge);
        }
      })

      socket.on('getGenesisBlock', async ()=>{
        await rateLimiter.consume(socket.handshake.address).catch(e => { 
          // console.log("Peer sent too many 'getNextBlock' events") 
        }); // consume 1 point per event from IP
        let genesisBlock = await this.chain.getGenesisBlockFromDB()
        socket.emit('genesisBlock', genesisBlock)
      })

    }
  }

  async getPeers(socket){
    socket.emit('newPeers', Object.keys(this.connectionsToPeers))
  }

  async getNextBlock(socket, header){
    if(header){
      let index = await this.chain.getIndexOfBlockHashInChain(header.hash)
      let previousIsKnown = await this.chain.getIndexOfBlockHashInChain(header.previousHash)
      if(previousIsKnown === 0 || previousIsKnown === '0'){
        previousIsKnown = true
      }
      let isGenesis = this.genesis.hash == header.hash

      if(isGenesis){
        let block = await this.chain.getBlockFromDB(1)
        let states = await this.chain.contractTable.getStateOfAllContracts(block.blockNumber)
        if(states.error) socket.emit('nextBlock', { error:'ERROR: Could not find contract states of block '+block.blockNumber })

        let balances = await this.chain.balance.getBalancesFromDB(block.blockNumber)
        if(balances.error) socket.emit('nextBlock', { error:'ERROR: Could not find balance states at block '+block.blockNumber })
              
        if(block && block.error) socket.emit('nextBlock', { error:block.error})
        else if(block && !block.error) socket.emit('nextBlock', { found:block, states:states, balances:balances })
        else socket.emit('nextBlock', { error:'Block not found'})
      }else{
        if(index && previousIsKnown){
          
          if(header.hash == this.chain.getLatestBlock().hash) socket.emit('nextBlock', {end:'End of blockchain'})
          else{

            let nextBlock = await this.chain.getNextBlockbyHash(header.hash)
            if(!nextBlock || nextBlock.error) socket.emit('nextBlock', {previousIsKnown:header})
            else{

              let latestBlock = this.chain.getLatestBlock()
              let block = await this.chain.getBlockFromDB(nextBlock.blockNumber)

              let states = await this.chain.contractTable.getStateOfAllContracts(nextBlock.blockNumber)
              if(states.error) socket.emit('nextBlock', { error:'ERROR: Could not find contract states of block '+nextBlock.blockNumber })

              let balances = await this.chain.balance.getBalancesFromDB(nextBlock.blockNumber)
              if(balances.error) socket.emit('nextBlock', { error:'ERROR: Could not find balance states at block '+nextBlock.blockNumber })

              if(!block) setTimeout(async()=>{ block = await this.chain.getBlockFromDB(nextBlock.blockNumber) }, 500)
              if(block && !block.error) socket.emit('nextBlock', { found:block, states:states, balances:balances })
              else{
                // console.log('No block but is it block before last?')
                let isBeforeLastBlock = nextBlock.blockNumber >= latestBlock.blockNumber// -1
                if(isBeforeLastBlock) socket.emit('nextBlock', { end:'End of blockchain' })
                else socket.emit('nextBlock', { 
                  error:`ERROR: Block ${nextBlock.blockNumber} of hash ${nextBlock.hash.substr(0, 8)} not found` 
                })
                
              }
            }
  
          }
        }else if(!index && previousIsKnown){
          let forkedBlock = await this.chain.getNextBlockbyHash(header.previousHash)
          if(forkedBlock) socket.emit('nextBlock', { previousFound:forkedBlock })
          else socket.emit('nextBlock', { previousNotFound:this.chain.getLatestBlock(), errorMessage:'Block not found'})
          
        }else{
          socket.emit('nextBlock', { previousNotFound:this.chain.getLatestBlock(), errorMessage:'Block not found'})
  
        }
      }


      
    }else{
      //Invalid header JSON
    }
  }

  async getAllContractStates(socket, blockNumber){
    try{
      // await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockFromHash' events") }); // consume 1 point per event from IP
      if(blockNumber){
        let states = await this.chain.contractTable.getStateOfAllContracts(blockNumber)
        socket.emit('contractStates', states)
      }else{
        logger('ERROR: Could not send contract states, block number provided is invalid')
      }
    }catch(e){
      console.log('Get All Contract States',e)
    }
  }

  async getBlockFromHash(socket, hash){
    // await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlockFromHash' events") }); // consume 1 point per event from IP
      if(hash && typeof hash == 'string'){
        
        let block = await this.chain.getBlockFromDBByHash(blockIndex);
          if(block){
            if(block.error) socket.emit('blockFromHash', {error:block.error})
            else socket.emit('blockFromHash', block)
            
          }else{
            socket.emit('blockFromHash', {error:'Block not found'})
          }
        
      }
  }

  async getBlock(socket, blockNumber, hash){
    await rateLimiter.consume(socket.handshake.address).catch(e => { console.log("Peer sent too many 'getBlock' events") });
      if(blockNumber && typeof blockNumber == 'number'){
        let block = await this.chain.getBlockFromDB(blockNumber);
        if(block){
          socket.emit('block', block)
        }else if(blockNumber >= this.chain.getLatestBlock().blockNumber + 1){
          socket.emit('block', {end:'End of block chain'})
        }else{
          socket.emit('block', {error:'Block not found'})
        }
        
      }
  }

  async getBlockHeader(socket, blockNumber){
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
  }

  async getBlockchainStatus(socket, peerStatus){
    try{

      let token = JSON.parse(socket.handshake.query.token)
      let peerAddress = token.address
      let status = this.buildBlockchainStatus()

      if(peerStatus && isValidBlockchainStatusJSON(peerStatus)){
        
        nodeDebug(`${peerAddress} requested a blockchain status`)
        socket.emit('blockchainStatus', status);
        
        let peer = this.connectionsToPeers[peerAddress];
        if(!peer) this.peerManager.connectToPeer(peerAddress)
        
        this.peerManager.peerStatus[peerAddress] = peerStatus
        this.peersLatestBlocks[peerAddress] = peerStatus.bestBlockHeader

        nodeDebug(`Peer ${peerAddress} shared its status`)
        nodeDebug(peerStatus.bestBlockHeader)

        let updated = await this.receiveBlockchainStatus(peer, peerStatus)
        if(updated.error){
          logger('STATUS ERROR:', updated.error)
        }
      }else{
        nodeDebug(`${peerAddress} requested a blockchain status`)
        nodeDebug(`Peer did not supply a valid blockchain status`)
        socket.emit('blockchainStatus', status);
      }
      
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
        emitter.on('peerDiscovered', async (peer)=> {
          let { host, port, address } = peer
          
          let reputation = await this.peerManager.reputationTable.getPeerReputation(address)
          console.log('Reputation in discovery', reputation)
          if(reputation != 'untrusted'){
            logger('Found new peer', chalk.green(address))
            this.peerManager.connectToPeer(address)
          }
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

  downloadBlockStates(peer, blockNumber){
    return new Promise((resolve)=>{
      if(peer && peer.connected){
        logger("Downloading contract states at block", blockNumber)
        peer.on('contractStates', (states)=>{
          peer.off('contractStates')
          clearTimeout(timeout)
          resolve(states)
        })
  
        peer.emit('getAllContractStates', blockNumber)
  
        let timeout = setTimeout(()=>{
          logger('Block states request timed out')
          peer.off('contractStates')
        }, 5000)
      }else{
        console.log('Peer supplied is invalid')
        console.log(peer)
      }
      
    })
  }

  async applyContractStates(states, blockNumber){
    if(states && Object.keys(states).length > 0){
      for await(let contractName of Object.keys(states)){
        let state = states[contractName]
        let stateSet = await this.chain.contractTable.manuallySetState(contractName, state, blockNumber)
        if(stateSet.error) console.log('STATE SET', stateSet.error)
      }

      return { applied:true }
    }else{
      console.log('No state changes', states)
      return { noStateChanged:true }
    }
  }

  downloadBlocks(peer){
    return new Promise(async (resolve)=>{
      if(peer && peer.connected){
         if(!this.isDownloading){
            this.isDownloading = true
            let requestTimer = false
            logger('Downloading blocks from peer ', peer.address)

            this.minerChannel.emit('nodeEvent','isDownloading')
            this.minerChannel.emit('nodeEvent','outOfSync')
            this.isOutOfSync = true
            let goingBackInChainCounter = this.chain.getLatestBlock().blockNumber - 1

            const closeConnection = (error=false) =>{
              peer.off('nextBlock')
              this.minerChannel.emit('nodeEvent','finishedDownloading')
              this.isDownloading = false;
            }

            const createTimer = (alreadyRetried=false, resendPayload) =>{
              requestTimer = setTimeout(()=>{
                if(!alreadyRetried){
                  logger('Retrying to send', resendPayload)
                  request(resendPayload, 'retried')
                }else{
                  closeConnection({ error:'timeout' })
                  // console.log('Download failed so peer is now out of sync')
                  peer.isSynced = false
                  resolve({ error:'ERROR: Download request timed out. Peer did not respond.' })
                }
              }, 10*1000)
            }
            
            const request = (payload, retried=false) =>{
              peer.emit('getNextBlock', payload)
              this.isDownloading = true
              
              if(requestTimer){
                 clearTimeout(requestTimer)
                 requestTimer = false
              }
              createTimer(retried, payload)
            }

            peer.on('nextBlock', async (block)=>{
              nodeDebug('Received block', block)

              clearTimeout(requestTimer)
              requestTimer = false
              createTimer(false, this.chain.getLatestBlock())

              if(block.end){

                this.isOutOfSync = false
                this.minerChannel.emit('nodeEvent','inSync')
                logger('Blockchain updated successfully!')
                clearTimeout(requestTimer)
                requestTimer = false
                peer.isSynced = true
                closeConnection()
                resolve({ downloaded:true })

              }else if(block.error){

                closeConnection({ error:true })
                resolve({ error:block.error })

              }else if(block.previousFound){
                //Represents a fork
                let fork = block.previousFound
                nodeDebug(`Next block ${block.blockNumber} was not found but previous ${fork.blockNumber} was.`)
                
                let rolledback = await this.chain.rollback(fork.blockNumber - 2)
                if(rolledback.error) logger('ROLLBACK ERROR:',rolledback.error)

                request(this.chain.getLatestBlock())

              }else if(block.previousNotFound){
                nodeDebug(`Next block ${block.blockNumber} not found. Walking back chain blocks.`)
                
                request(this.chain.getBlockHeader(goingBackInChainCounter))
                goingBackInChainCounter--

              }else if(block.found){

                let nextBlock = block.found
                let contractStates = block.states
                let balances = block.balances

                let added = await this.chain.receiveBlock(nextBlock, 'overwrite', contractStates, balances)
                if(added.error){
                  if(added.exists){
                    closeConnection({ error:true })
                    resolve({error:added.error,exists:added.exists})
                  }else if(added.existsInPool){
                    closeConnection({ error:true })
                    resolve({error:added.error,existsInPool:added.existsInPool})
                  }else if(added.isRollingBack){
                    logger(chalk.yellow(added.error))
                    closeConnection({ error:true })
                    resolve({error:added.error})
                  }else if(added.isRoutingBlock){
                    logger(chalk.yellow(added.error))
                    closeConnection({ error:true })
                    resolve({error:added.error})
                  }else{
                    closeConnection({ error:true })
                    resolve({error:added.error})
                  }
                }else{
                  let applied = await this.applyContractStates(contractStates, nextBlock.blockNumber)
                  if(applied.error){
                    closeConnection({ error:true })
                    resolve({error:added.error})
                  }

                  request(this.chain.getLatestBlock())
                }
              }else{
                console.log('Received something else')
                closeConnection({ error:true })
                resolve({error:block})
              }
            })

            request(this.chain.getLatestBlock())
         }else{
           resolve({ error:`ERROR: Node is already downloading blocks` })
         }
        
      }else{
        resolve({ switchPeers:true })
      }

      
    })
    
  }


  buildBlockchainStatus(){
    let status = {
      totalDifficultyHex: this.chain.getDifficultyTotal(),
      bestBlockHeader: this.chain.getLatestBlock(),
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
      if(peer && status){
        if(this.isDownloading || this.chain.isRoutingBlock){
          resolve(true)
        }else{
          if(isValidBlockchainStatusJSON(status)){
            let { totalDifficultyHex, bestBlockHeader, length } = status;
            let latestBlock = this.chain.getLatestBlock()
            if(totalDifficultyHex && bestBlockHeader && length){
              if(bestBlockHeader.blockNumber > latestBlock.blockNumber + 1){
                this.peersLatestBlocks[peer.address] = bestBlockHeader
                let thisTotalDifficultyHex = await this.chain.getDifficultyTotal();
                // Possible major bug, will not sync if chain is longer but has different block at a given height
                let totalDifficulty = BigInt(parseInt(totalDifficultyHex, 16))
                let thisTotalDifficulty =  BigInt(parseInt(thisTotalDifficultyHex, 16))
                
                if(thisTotalDifficulty < totalDifficulty){
                  
                    let isValidHeader = this.chain.validateBlockHeader(bestBlockHeader);
                    if(isValidHeader){
    
                        let updated = await this.updateBlockchain()
                        if(updated.error){
                          resolve({error:updated.error})
                        }else if(updated.busy){
                          resolve({ busy:updated.busy })
                        }else {
                          resolve(updated)
                        }
  
                    }else{
                      resolve({ error:'ERROR: Last block header from peer is invalid' })
                    }
                }else{
                  resolve({ updated })
                }
              }else{
                resolve({ isStillUpdated:true })
              }
            }else{
              resolve(false)
            }
          }else{
            nodeDebug('Peer supplied an invalid status object')
            resolve(false)
          }
        }
        
      }else{
        resolve({ error:'ERROR: Cannot receive status without peer or status' })
      }
    })
    
  }

  async updateBlockchain(){
    if(!this.chain.isRollingBack){
      let peer = await this.getBestPeer()
      if(peer){
        return await this.downloadBlocks(peer)
      }else{
        let status = this.buildBlockchainStatus()
        this.broadcast("getBlockchainStatus", status)
        return { broadcasted:true }
      }
    }else{
      return {busy:'Warning: Could not update now. Node is rolling back blocks'}
    }
    
  }


  async getPeerStatuses(){
    if(Object.keys(this.connectionsToPeers).length > 0){
      
      for await(let address of Object.keys(this.connectionsToPeers)){
        let peer = this.connectionsToPeers[address]
        peer.once('status', (status)=>{
            if(status && isValidBlockchainStatusJSON(status)){
              this.peerManager.peerStatus[address] = status
              let blockHeader = status.bestBlockHeader
              this.peersLatestBlocks[address] = blockHeader
              if(blockHeader.blockNumber + this.tolerableBlockGap < this.chain.getLatestBlock().blockNumber){
                nodeDebug(`Peer ${address} is not synced`)
                peer.isSynced = false
              }else{
                nodeDebug(`Peer ${address} is in sync`)
                peer.isSynced = true
              }
            }else{
              console.log(`Peer ${address} provided invalid status`)
              console.log(status)
              peer.isSynced = false
            }
        })
        peer.emit('getStatus')
      }

      return { received:this.peerManager.peerStatus }

    }else return false
  }

  //Get best block according to reputation, network availability and block height
  async getBestPeer(except=[]){
    if(Object.keys(this.connectionsToPeers).length > 0){
    
      let bestPeer = false
      let bestPeerBlock = {
        blockNumber:0
      }

      for await(let address of Object.keys(this.connectionsToPeers)){
        let peer = this.connectionsToPeers[address]
        let peerBlock = this.peersLatestBlocks[address]
        if(peerBlock && peer.isSynced && !except.includes(address)){
          if(bestPeerBlock.blockNumber < peerBlock.blockNumber && this.chain.getLatestBlock().blockNumber < peerBlock.blockNumber){
            bestPeer = peer
          }
        }
      }

      return bestPeer


    }else return false
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
     
      socket.on('action',async (action)=>{
        try{
          if(isValidActionJSON(action)){
            let actionEmitted = await this.broadcastAction(action)
            if(!actionEmitted.error){
                socket.emit('result', actionEmitted);
              }else{
                socket.emit('result',{error:actionEmitted.error})
              }
          }else{
            socket.emit('result',{error:'ERROR: Invalid action format'})
          }
          
        }catch(e){
          console.log(chalk.red(e))
          socket.emit('result',{error:e.message})
        }
      })
     
           
     socket.on('testAction',async (action)=>{
       try{
          if(isValidActionJSON(action)){
            
            
            let actionEmitted = await this.testAction(action)
            console.log('Result of test', actionEmitted)
            if(!actionEmitted.error){
                socket.emit('testResult', actionEmitted);
              }else{
                socket.emit('testResult',{error:actionEmitted.error})
              }
            
          }else{
            socket.emit('testResult',{error:'ERROR: Invalid action format'})
          }
          
        }catch(e){
          console.log(chalk.red(e))
          socket.emit('result',{error:e.message})
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
     
     socket.on('recalculateBalance', async ()=>{
        console.log('Initial State', this.chain.balance.states)
        let recalculated = await this.chain.reRunBalancesOfBlockchain()
        console.log('Finished', recalculated)
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
          let state = await storage.getState(blockNumber)
          socket.emit('contractState', state)
        }
      })

      socket.on('getWholeState', async (contractName)=>{
        let storage = this.chain.contractTable.stateStorage[contractName]
        if(!storage) socket.emit('contractState', { error:`Contract Storage of ${contractName} not found` })
        else if(storage.error) socket.emit('contractState', { error:storage.error })
        else{
          let log = storage.changeLog
          socket.emit('contractState', log)
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
        let isValidChain = await this.chain.validateBlockchain();
        if(isValidChain){
          logger('Is valid?', isValidChain)
          logger('Blockchain is valid')
        }
      })

      socket.on('getBlockSize', async (blockNumber)=>{
        let block = await this.chain.getBlockFromDB(blockNumber)
        console.log('Block', require('json-size')(block))
      })

      socket.on('verbose', ()=>{
        
        if(this.verbose){
          this.UILog('Verbose set to OFF');
          logger('Verbose set to OFF');
          this.verbose = false;
          this.minerChannel.emit('nodeEvent','verbose')
        }else{
          this.UILog('Verbose set to ON');
          logger('Verbose set to ON');
          this.verbose = true;
         this.minerChannel.emit('nodeEvent','verbose')
        }
        
        socket.emit('verboseToggled', this.verbose)
      
      })

      socket.on('getContractStates',async (blockNumber)=>{
        let peerAddrs = Object.keys(this.connectionsToPeers)
        let peer = this.connectionsToPeers[peerAddrs[0]]
        let states = await this.downloadBlockStates(peer, blockNumber)
        socket.emit('states', states)
      })

      socket.on('update', ()=>{
        this.isDownloading = false
        this.broadcast('getBlockchainStatus');
      })

      socket.on('getMempool', ()=>{
        socket.emit('mempool', { transactions:this.mempool.txReceipts, actions:this.mempool.actionReceipts });
      })

      socket.on('stopMining', ()=>{
        logger('Stopping miner')
        this.minerChannel.emit('stopMining')
      })

      socket.on('rollback', async (number)=>{
        number = parseInt(number)
        if(number == 'NaN') socket.emit('rollbackResult', { error:'ERROR: Block number must be numerical' })
        else{
          global.minerChannel.emit('nodeEvent', 'isBusy')
          global.minerChannel.emit('nodeEvent', 'isRollingBack')
          let rolledback = await this.chain.rollback(number)
          socket.emit('rollbackResult', rolledback)
          global.minerChannel.emit('nodeEvent', 'isAvailable')
        }
        
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

  /**
   * @desc Starts an socket server for either block miners, validators or producers
   * to interact with the node
   * @param {Socket} socket 
   */
  async startMinerAPI(socket){
    logger('Miner connected')
    
    this.minerAPI = new MinerAPI({
      chain:this.chain,
      mempool:this.mempool,
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
            if(added.error){
              console.log(added)
              logger(chalk.red('REJECTED BLOCK:'), added.error)
            }
            else if(added.busy) logger(chalk.yellow(added.busy))
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
      if(transaction && this.chain instanceof Blockchain){
        if(isValidTransactionJSON(transaction) || isValidTransactionCallJSON(transaction)){
  
          this.chain.validateTransaction(transaction)
          .then(async (valid) => {
            if(!valid.error){
              await this.mempool.addTransaction(transaction);
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

      let isValid = await this.chain.validateAction(action)
      if(!isValid || isValid.error){
        if(this.verbose) logger(chalk.red('!!!')+' Rejected invalid action : '+ action.hash.substr(0, 15)+"...")
        resolve({error:isValid.error})
      }else{
        //Action will be added to this.mempool only is valid and if corresponds with contract call
        this.UILog('«-'+' Received valid action : '+ action.hash.substr(0, 15)+"...")
        if(this.verbose) logger(chalk.cyan('«-')+' Received valid action : '+ action.hash.substr(0, 15)+"...")
        await this.mempool.addAction(action)
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
   * @desc Validates than adds peers' new blocks to current blockchain
   * If mining, stops miner upon reception and confirmation of validity
   * @param {Object} data 
   * @param {String} fromPeer 
   * @param {Object} peerMessage 
   */
  handleNewBlockFound(data, relayPeer, peerMessage){
    return new Promise( async (resolve)=>{
      if(this.chain instanceof Blockchain && data){
        
        if(!this.isDownloading && !this.chain.isRollingBack){
          try{
            if(!this.isOutOfSync){
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
                    this.peersLatestBlocks[relayPeer] = block
  
                    //Tells the miner to stop mining and stand by
                    //While node is pushing next block
                    this.minerChannel.emit('nodeEvent','stopMining')
                    this.minerChannel.emit('nodeEvent','isBusy')
                    //Validates than runs the block
                    let added = await this.chain.receiveBlock(block);
                    let handled = await this.handleBlockReception(added, block)
                    resolve(handled)
      
                  }else{
                    resolve({error:'ERROR:New block header is invalid'})
                  }
                }else{
                  resolve({error:`ERROR: Block ${block.blockNumber} already received`})
                }
              }
            }else{
              resolve({busy:'ERROR: Node is out of sync'})
            }
            
            
          }catch(e){
            resolve({error:e.message})
          }
        }else{
          
          if(this.isDownloading) resolve({ busy:'ERROR: Node is busy downloading, could not add block' })
          else if(this.isRollingBack) resolve({ busy:'ERROR: Node is busy rolling back blocks, could not add block' })
          else resolve({busy:'ERROR: Node is busy, could not add block'})
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
  handleBlockReception(reception, block){
    return new Promise(async (resolve)=>{
      if(reception.error){

        if(reception.exists && reception.duplicate){
          resolve({error:reception.error})
        }else if(reception.exists && !reception.duplicate){
          let routed = await this.chain.routeBlockToPool(block)
          if(routed.error) resolve({error:routed.error})
          else if(routed.rollback){
            let rolledBack = await this.chain.rollback(routed.rollback -1)
             if(rolledBack){
               if(rolledBack.error) logger(chalk.red('BLOCK HANDLING ERROR:'), rolledBack.error)
               else{
                 let updated = await this.updateBlockchain()
                 if(updated.error) resolve({error:updated.error})
                 else if(updated.busy){
                   resolve({ busy:updated.busy })
                 }else resolve(updated)
               }
             }
        
          }
        }else if(reception.isRoutingBlock){
          let routed = await this.chain.routeBlockToPool(block)
          if(routed.error) resolve({error:routed.error})
          else if(routed.rollback){
            let rolledBack = await this.chain.rollback(routed.rollback -1)
             if(rolledBack){
               if(rolledBack.error) logger(chalk.red('BLOCK HANDLING ERROR:'), rolledBack.error)
               else{
                 let updated = await this.updateBlockchain()
                 if(updated.error) resolve({error:updated.error})
                 else if(updated.busy){
                   resolve({ busy:updated.busy })
                 }else resolve(updated)
               }
             }
        
          }
        }else if(reception.isRollingBack){
          resolve({ busy:reception.error })
        }else{
          resolve({error:reception.error})
        }
        
      }
      else if(reception.requestUpdate){
        
        let updated = await this.updateBlockchain()
        this.minerChannel.emit('nodeEvent','isAvailable')
        if(updated.error) resolve({error:updated.error})
        else if(updated.busy){
          resolve({ busy:updated.busy })
        }else resolve(updated)
      }
      else if(reception.rollback){
        
        let rolledBack = await this.chain.rollback(reception.rollback -1)
        if(rolledBack){
          if(rolledBack.error) logger('BLOCK HANDLING ERROR:', rolledBack.error)
          else{
            let updated = await this.updateBlockchain()
            if(updated.error) resolve({error:updated.error})
            else if(updated.busy){
              resolve({ busy:updated.busy })
            }else resolve(updated)
          }
        }
        
      }else{
        this.minerChannel.emit('nodeEvent','isAvailable')
        resolve(reception)
      }
      
    })
  }

  /**
   * @desc Validates blockchain and, if not valid, rolls back to before the conflicting block
   * @param {Boolean} allowRollback 
   */
  async validateBlockchain(allowRollback){
    if(this.chain instanceof Blockchain){
      let isValid = this.chain.isChainValid();
      if(isValid.conflict){
        let atBlockNumber = isValid.conflict;
        if(allowRollback){
          let rolledback = await this.chain.rollback(atBlockNumber-1);
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
              if(test){
                let result = await this.chain.testCall(call)
              
                if(result.error) resolve({error:result.error})
                else{
                  //Transactions added to pool for confirmation by peers blocks or by this
                  //node's blocks. 
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
        }else if(transaction.type == 'payable'){
          resolve({error:'ERROR: Payables may only be created from within a contract'})
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
              if(added.error) resolve({ error:added.error })
              else resolve({action:action, success:success})
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
      this.chain.save()
      let backUp = await this.chain.saveLastKnownBlockToDB()
      if(backUp.error) console.log('Heartbeat ERROR:', backUp.error)
    }, this.messageBufferCleanUpDelay)
  }

   /**
      @desc Routine tasks go here. The heartbeat's delay is adjusted in nodeconfig
    */
  syncHeartBeat(){
    setInterval(async ()=>{
        let currentStatus = this.buildBlockchainStatus()
        this.broadcast('getBlockchainStatus', currentStatus)
        await this.getPeerStatuses()
    }, this.synchronizeDelay)
  }

  housekeeping(){

  }

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
