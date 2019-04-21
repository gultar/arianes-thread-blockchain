const Node = require('../../Node.js');

'use strict'
const express = require('express');
const http = require('http');
const RateLimit = require('express-rate-limit');
const helmet = require('helmet');
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
const bodyParser = require('body-parser');

class Relay{
    constructor(){
        this.address = 'http://'+address+':'+port,
        this.port = port
        this.id = sha1(this.address);
        this.ioServer = {};
        this.userInterfaces = [];
        this.peersConnected = {};
        this.connectionsToPeers = {};
        this.nodeList = new NodeList();
        this.messageBuffer = {};
        this.verbose = false;
        this.longestChain = {
          length:0,
          peerAddress:''
        }  //Serves to store messages from other nodes to avoid infinite feedback
    }

    startServer(app=express()){

    }

    joinPeers(){

    }

    findPeers(){

    }

    connectToPeer(address, callback){

    }

    broadcast(eventType, data, moreData=false ){

    }

    serverBroadcast(eventType, data){

    }

    outputToUI(message, arg){

    }

    initHTTPAPI(app){

    }

    nodeEventHandlers(socket){

    }

    externalEventHandlers(socket){

    }

    sendPeerMessage(type, data){

    }

    handlePeerMessage(type, originAddress, messageId, data){

    }

    requestKnownPeers(address){

    }

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

}