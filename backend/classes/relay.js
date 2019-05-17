const Node = require('../../Node.js');

'use strict'
const express = require('express');
const http = require('http');
const RateLimit = require('express-rate-limit');
const helmet = require('helmet');
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
const { logger, readFile } = require('../tools/utils');
const sha256 = require('../tools/sha256');
const sha1 = require('sha1');
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');

class Relay{
    constructor(address, port){
        this.address = 'http://'+address+':'+port,
        this.port = port
        this.id = sha1(this.address);
        this.ioServer = {};
        this.userInterfaces = [];
        this.peersConnected = {};
        this.connectionsToPeers = {};
        this.nodeList = []
        this.messageBuffer = {};
        this.verbose = false;
        this.longestChain = {
          length:0,
          peerAddress:''
        }  //Serves to store messages from other nodes to avoid infinite feedback
    }

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
        
        this.cleanMessageBuffer();
        this.ioServer = socketIo(server, {'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':false });
        
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
                    this.nodeEventHandlers(socket);
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
                peer.emit('message', 'Peer connection established by '+ this.address+' at : '+ displayTime());
                peer.emit('connectionRequest', this.address);
                this.sendPeerMessage('addressBroadcast');
                
                this.connectionsToPeers[address] = peer;
                
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
    // outputToUI(message, arg){

    // }

    // initHTTPAPI(app){

    // }

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

    }

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

    handlePeerMessage(type, originAddress, messageId, data){
      let peerMessage = { 'type':type, 'originAddress':originAddress, 'messageId':messageId, 'data':data }
  
      if(!this.messageBuffer[messageId]){
        switch(type){
          case 'transaction':
            //Validate transaction;
            //if valid broadcast, if invalid block
            break;
          case 'newBlock':
            //store only latest block
            //If peer is looking for data, query peer full nodes
            break;
          case 'whoisLongestChain':
            //return current longestchain
            break;
          case 'message':
            logger(chalk.green('['+originAddress+']')+' -> '+data)
            break;
  
  
        }
        logger(`Forwarding ${type} message to other nodes`)
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
    let address = '10.10.10.10';
    let port = 9000 + i;
    var node = new Relay(address, port);
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