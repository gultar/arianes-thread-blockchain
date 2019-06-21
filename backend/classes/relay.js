const Node = require('../../Node.js');

'use strict'
const express = require('express');
const http = require('http');
const RateLimit = require('express-rate-limit');
const helmet = require('helmet');
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
const { logger, readFile } = require('../tools/utils');
const NodeList = require('./nodelist')
const sha256 = require('../tools/sha256');
const sha1 = require('sha1');
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');

class Relay{
    constructor(options){
      //Basic node configs
      this.address = (options.address ? options.address : 'http://localhost:8000');
      this.port = (options.port ? options.port : 8000)
      this.id = (options.id ? options.id : sha1(Math.random() * Date.now()))
      this.publicKey = (options.publicKey ? options.publicKey : 'unkown');
      this.verbose = (options.verbose ? true : false);
      this.messageBufferCleanUpDelay = (options.cleanupDelay ? options.cleanupDelay : 30 * 1000);
      this.messageBuffer = {};
      this.peersConnected = {}; //From ioServer to ioClient
      this.connectionsToPeers = {}; //From ioClient to ioServer
      this.nodeList = new NodeList();
    }

    startServer(app=express()){
      try{
        logger(`Starting relay server at ${this.address}`)
        app.use(express.static(__dirname+'/views'));
        express.json({ limit: '300kb' })
        app.use(helmet())
        const server = http.createServer(app).listen(this.port);
        
        this.cleanMessageBuffer();
        this.ioServer = socketIo(server, {'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':false });
        
     
      this.ioServer.on('connection', (socket) => {
        if(socket){
           if(socket.handshake.query.token !== undefined){
            if(!this.peersConnected[socket.handshake.headers.host]){
                socket.on('message', (msg) => { logger('Client:', msg); });
 
                let peerToken = JSON.parse(socket.handshake.query.token);
                let peerAddress = peerToken.address;
               
                 if(socket.request.headers['user-agent'] === 'node-XMLHttpRequest'){
                   this.peersConnected[peerAddress] = socket;
                   this.nodeEventHandlers(socket);
                 }else{
                  socket.emit('message', 'Connected to local node');
                  this.externalEventHandlers(socket);
                 } 
                
            }else{
              //  logger('Peer is already connected to node')
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
     
      }catch(e){
        console.log(chalk.red(e))
      }
   }

    joinPeers(){
      try{
        if(this.nodeList){
          this.nodeList.forEach((peer)=>{
            this.connectToPeer(peer);
          })
        }
      }catch(e){
        console.log(chalk.red(e))
      }
    }

    findPeers(){

    }

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
                peer.emit('message', 'Connection established by '+ this.address);
                peer.emit('connectionRequest', this.address);
                this.sendPeerMessage('addressBroadcast');
                
                this.connectionsToPeers[address] = peer;
                this.nodeList.addNewAddress(address)
              }else{
                logger('Already connected to target node')
              }
            })

            peer.on('disconnect', () =>{
              logger('connection with peer dropped');
              delete this.connectionsToPeers[address];
                
              
            })
  
            if(callback){
              callback(peer)
            }
  
          }catch(e){
            console.log(e);
          }
  
        }else{
          
        }
  
      }
    }
  

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

    serverBroadcast(eventType, data){
      this.ioServer.emit(eventType, data);
    }

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

    externalEventHandlers(socket){
      socket.on('getKnownPeers', ()=>{
        socket.emit('knownPeers', this.nodeList.addresses);
      })

      socket.on('addPeer', (address)=>{
        this.nodeList.addNewAddress(address)
      })
    }

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

    handlePeerMessage(type, originAddress, messageId, data){
      if(data){
        try{
          let peerMessage = { 
            'type':type, 
            'originAddress':originAddress, 
            'messageId':messageId, 
            'data':data,
            'relayPeer':relayPeer 
          }
    
          if(!this.messageBuffer[messageId]){
  
            this.messageBuffer[messageId] = peerMessage;
  
            switch(type){
              case 'newBlockFound':
                //Do something to avoid leaving a node without
                //block download
                break;
              default:
                  this.broadcast('peerMessage', peerMessage)
                break;
            }
            
          }
        }catch(e){
          console.log(e)
        }  
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
  
  
    requestKnownPeers(address){

    }

    cleanMessageBuffer(){
        var that = this;
        setInterval(()=>{
          that.messageBuffer = {};
          
          
        }, 30000)
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

module.exports = Relay;

const tryOut = () =>{
  let nodes = [];
  let numberOfNodesToGenerate = 4
  for(var i=0; i<numberOfNodesToGenerate ;i++){
    let address = 'http://localhost:';
    let port = 9000 + i;
    var node = new Relay({
      address:address+port,
      port:port
    });
    nodes.push(node);
  }

  setTimeout(()=>{
    for(var y=0; y<numberOfNodesToGenerate ;y++){
      nodes[y].startServer();
    }

    

    for(var x=0; x<numberOfNodesToGenerate-1 ; x++){
      let currentNode = nodes[x];
      for(var u=0; u <nodes.length; u++){
        if(currentNode.address !== nodes[u].address){
          currentNode.connectToPeer(nodes[u].address)
        }
      }
      // nodes[x].connectToPeer(nodes[x+1].address)
    }


  },1000)
}

tryOut();