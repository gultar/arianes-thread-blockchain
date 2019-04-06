const express = require('express');
const http = require('http');
const Node = require('./node');
const Transaction = require('./backend/transaction');
let port = 8000;
let address = '127.0.0.1'
let arg = '';
let node;

let addrArg = process.argv.indexOf('--address');
let portArg = process.argv.indexOf('--port');

if(addrArg !== -1){
  address = process.argv[addrArg+1];
  if(port !== -1){
    port = process.argv[portArg+1];
  }

}
node = new Node(address, port);
node.startServer();
setTimeout(()=>{
  node.joinPeers();
  setTimeout(()=>{
    node.updateAndMine();
  },3000)
},3000)
