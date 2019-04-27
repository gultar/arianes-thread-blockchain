#!/usr/bin/env node

const node = require('./node');
const { copyFile } = require('./backend/tools/blockchainHandler');
const program = require('commander');
const { logger } = require('./backend/tools/utils');
//let node;


program
  .version('0.0.1')
  .option('-j, --join', 'Joins network')
  .option('-m, --mine', 'Starts the node as a miner')
  .option('-u, --update', 'Tries to update chain by querying for the longest chain in the network')
  .option('-s, --seed', 'Seed nodes to initiate p2p connections')
  .option('-t, --test', 'Test')
  .option('-tx, --txgen', 'TEST ONLY - Transaction generator')
  .option('-v, --verbose', 'Enable transaction and network verbose')
  .option('.-b, --backup', 'Enable blockchain backup');


program
  .command('start <address> <port>')
  .usage('<address> <port>')
  .description('Starts blockchain node')
  .action((address, port, cmd)=>{
    //node = new Node(address, port);
    node.address = 'http://'+address+':'+port;
    node.port = port;
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
        setTimeout(()=>{
          node.update();
          console.log(node.knownPeers)
        },6000)
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
      setInterval(()=>{

      }, 20000)
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
  

  if(process.MINER){
    logger('Stopping miner');
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

