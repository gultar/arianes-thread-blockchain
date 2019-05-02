const Node = require('../../Node.js');

'use strict'
const express = require('express');
const http = require('http');
const RateLimit = require('express-rate-limit');
const helmet = require('helmet');
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
const { logger } = require('../tools/utils');
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
        logger(`Starting relay at ${this.address}`)
        const expressWs = require('express-ws')(app);
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
          let peerAddress;
          let peerToken;
           if(socket.handshake.query.token !== undefined){
               try{
                 socket.on('message', (msg) => { logger('Client:', msg); });
  
                 peerToken = JSON.parse(socket.handshake.query.token);
                 peerAddress = peerToken.address
  
                 if(socket.request.headers['user-agent'] === 'node-XMLHttpRequest'){
  
                   this.peersConnected[peerAddress] = socket;
                   if(!this.nodeList.includes(peerAddress)){
                    this.nodeList.push(peerAddress);
                   }
                      
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
  
            // logger('Requesting connection to '+ address+ ' ...');
            
  
            peer.on('connect_timeout', (timeout)=>{
              if(connectionAttempts >= 3) { 
                peer.destroy()
                delete this.connectionsToPeers[address];
              }else{
                // logger('Connection attempt to address '+address+' timed out.\n'+(4 - connectionAttempts)+' attempts left');
                connectionAttempts++;
              }
                
            })
  
            peer.on('connect', () =>{
              if(!this.connectionsToPeers.hasOwnProperty(address)){
                //Console output
                logger(chalk.green(`${this.address} connected to ${address}`))
                
                //Messages emitted to peer
                // peer.emit('message', 'Peer connection established by '+ this.address+' at : '+ displayTime());
                peer.emit('connectionRequest', this.address);
                // this.sendPeerMessage('addressBroadcast');
                //Handling of socket and peer address
                this.connectionsToPeers[address] = peer;
                this.nodeList.push(address)
                
              }else{
                logger('Already connected to target node')
              }
            })
  
            peer.on('message', (message)=>{
                logger('Server: ' + message);
            })
  
            peer.on('getAddr', ()=>{
              peer.emit('addr', this.nodeList);
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
  
    requestKnownPeers(address){

    }

    cleanMessageBuffer(){
        var that = this;
        setInterval(()=>{
          that.messageBuffer = {};
          
          
        }, 30000)
    }

    // UILog(message, arg){
    //     if(arg){
    //       this.outputToUI(message, arg)
    //     }else{
    //       this.outputToUI(message)
    //     }
    // }

}

module.exports = Relay;

const tryOut = () =>{
  let nodes = [];
  let numberOfNodesToGenerate = 10
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