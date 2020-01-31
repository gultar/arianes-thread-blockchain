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
const sha1 = require('sha1')
const chalk = require('chalk');
const { RateLimiterMemory } = require('rate-limiter-flexible');


class LightNode{
    //Genesis Configs
    this.genesis = options.genesis
    //Basic node configs
    this.host = options.host || 'localhost',
    this.port = options.port || '8000'
    this.httpsEnabled = options.httpsEnabled
    this.httpPrefix = (this.httpsEnabled ? 'https' : 'http')
    this.exposeHTTP = options.exposeHTTP || false
    this.address = `${this.httpPrefix}://${this.host}:${this.port}`;
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
    //Network tools
    this.ssl = new SSLHandler()
    
    //Network related parameters
    this.ioServer = {};
    this.userInterfaces = [];
    this.peersConnected = {}; //From ioServer to ioClient
    this.connectionsToPeers = {}; //From ioClient to ioServer
    this.peersLatestBlocks = {}
    this.messageBuffer = {};
    this.messageBufferCleanUpDelay = 30 * 1000;
    this.peerMessageExpiration = 30 * 1000
    this.peerManager = new PeerManager({
      address:this.address,
      connectionsToPeers:this.connectionsToPeers,
      nodeList:this.nodeList,
      noLocalhost:this.noLocalhost,
      receiveBlockchainStatus:(peer, status)=>{
        return this.receiveBlockchainStatus(peer, status)
      },
      UILog:(...args)=>{
        return this.UILog(...args)
      },
      buildBlockchainStatus:async ()=>{
        return { error:'ERROR: Cannot build blockchain status on light node' }
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
        return { error:'ERROR: Cannot test Action on light node' }
      },
      getChainInfo:()=>{
        return { error:'ERROR: Cannot retrive chain info from light node' }
      }
    })
}