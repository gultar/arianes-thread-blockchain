#!/usr/bin/env node

const Node = require('./node');
const { copyFile } = require('./backend/tools/blockchainHandler');
const program = require('commander');
const { logger, readFile } = require('./backend/tools/utils');
const fs = require('fs')


let node;



const loadNodeConfig = () =>{
  return new Promise(async (resolve)=>{
    fs.exists('./config/nodeconfig.json', async (exists)=>{
      if(exists){
        let nodeConfigString = await readFile('./config/nodeconfig.json');
        try{
          if(nodeConfigString){
            let nodeConfig = JSON.parse(nodeConfigString);
            resolve(nodeConfig)
          }else{
            resolve(false)
          }
          
        }catch(e){
          logger(e)
        }
      }else{
        logger('ERROR: Inexisting file')
        resolve(false)
      }
    })
  })
  
}



program
  .version('0.0.1')
  .usage('<value> [-options]')
  .description(
  `
  Possible other commands:

  wallet - For managing wallets and wallet states
  sendTx - For sending transactions from one wallet to another
  action - For creating and sending an action to a contract
  chain  - For querying the blockchain for information
  config - For updating node config file
  pool   - For managing transaction pool
  `
    )
  .option('-j, --join', 'Joins network')
  .option('-m, --mine', 'Starts the node as a miner')
  .option('-s, --seed', 'Seed nodes to initiate p2p connections')
  .option('-v, --verbose', 'Enable transaction and network verbose')
  .option('-j, --jsondebug', 'Debugs JSON schema')

program
  .command('start')
  .usage('')
  .description('Starts blockchain node')
  .action(async ()=>{


    let configs = await loadNodeConfig();
    if(configs){
      node = new Node({
        address:configs.address,
        port:configs.port
      })
      node.startServer()
    }


    if(program.join){
      setTimeout(()=>{
        node.joinPeers();
      },4000)
    }

    if(program.seed){

      setTimeout(()=>{
        node.connectToPeer(program.seed)
       
      },3000)

    }

    if(program.mine){
      let startMiner = setInterval(()=>{
        if(node.updated){
          node.minerStarted = true;
          node.createMiner()
          clearInterval(startMiner)
        }
      },1000)
      
    }

    if(program.verbose){
      node.verbose = true;
    }
    
  });

program.parse(process.argv)

process.on('SIGINT', () => {
  logger('Shutting down node and saving state');
  

  if(process.MINER){
    logger('Stopping miner');
    process.ACTIVE_MINER.kill()
  }

  node.closeNode()
  
  node.save()
  .then((saved)=>{
    if(saved){
      process.exit()
    }
  })
  .catch(e=> console.log(e))
  

});

