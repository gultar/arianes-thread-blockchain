const express = require('express');
const http = require('http');
const Node = require('./node');
const Transaction = require('./backend/transaction');
const { copyFile } = require('./backend/blockchainHandler');
const program = require('commander');
const { logger } = require('./backend/utils');
const mempool = require('./backend/mempool');
let port = 8000;
let arg = '';
let node;


program
  .version('0.0.1')
  .option('-j, --join', 'Joins network')
  .option('-m, --mine', 'Starts the node as a miner')
  .option('-u, --update', 'Tries to update chain by querying for the longest chain in the network')
  .option('-s, --seed', 'Seed nodes to initiate p2p connections')
  .option('-t, --txgen', 'TEST ONLY - Transaction generator')
  .option('-v, --verbose', 'Enable transaction and network verbose')
  .option('.-b, --backup', 'Enable blockchain backup');


program
  .command('start <address> <port>')
  .usage('<address> <port>')
  .description('Starts blockchain node')
  .action((address, port, cmd)=>{
    node = new Node(address, port);
    node.startServer()

    if(program.join){
      setTimeout(()=>{
        node.joinPeers();
        setTimeout(()=>{
          node.update();
        },4000)
      },4000)
    }
	
    if(program.test){
      setTimeout(()=>{
        node.rollBackBlocks(program.test);
        node.save();
      },5000)

    }

    if(program.seed){

      setTimeout(()=>{
        node.connectToPeer(program.seed)
      },3000)

    }

    if(program.mine){
      //Update then mine
        setTimeout(()=>{
          node.updateAndMine()
      },3000)

    }

    if(program.update && !program.mine){
      setTimeout(()=>{
        node.update();
      },6000)
    }

    if(program.txgen){
      setTimeout(()=>{
        node.txgen();
      },3000)
    }

    if(program.backup){
      copyFile('blockchain.json', './config/blockchain.json');
    }

    if(program.verbose){
      node.verbose = true;
    }

  });

program.parse(process.argv)

process.on('SIGINT', () => {
  logger('Shutting down node and saving state');
  node.minerStarted = false;
  node.minerPaused = true;
  mempool.saveMempool();

  if(process.MINER){
    process.MINER.stop();
    
  }
  node.save((saved)=>{
    if(saved){
      setTimeout(()=>{
        process.exit()
      },3000)
    }
  });
  

});

//
// const spawnNodes = (number, callback)=>{
//   var nodes = []
//   for(var i=0; i<number; i++){
//     nodes.push(new Node('127.0.0.1', portCounter));
//     nodes[i].startServer();
//     portCounter++;
//   }
//   callback(nodes);
// }
//
//
// const connectNodes = (nodes) =>{
//   for(var i=0; i<nodes.length; i++){
//     if(i>0){
//       if(i == nodes.length-1){
//         nodes[i].connectToPeer(nodes[0].address, (peer)=>{})
//       }else{
//         nodes[i].connectToPeer(nodes[i-1].address, (peer)=>{})
//       }
//
//     }
//   }
// }
