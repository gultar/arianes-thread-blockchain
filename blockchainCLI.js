#!/usr/bin/env node

const Node = require('./node');
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
  .option('-a, --address <address>', 'Specify node full ip address')
  .option('-n, --hostname <hostname>', 'Specify node hostname')
  .option('-p, --port <port>', 'Specify node port')
  .option('-j, --join [network]', 'Joins network')
  .option('-s, --seed <seed>', 'Seed nodes to initiate p2p connections')
  .option('-v, --verbose', 'Enable transaction and network verbose')
  .option('-p, --peerDiscovery', 'Enable peer discovery using various methods')

program
  .command('start')
  .usage('')
  .description('Starts blockchain node')
  .action(async ()=>{
    
    let configs = await loadNodeConfig();
      if(program.verbose){
        configs.verbose = true;
      }

      node = new Node({
        address:program.address ? program.address : configs.address,
        host:program.hostname ? program.hostname : configs.host,
        port:program.port ? program.port : configs.port,
        verbose:configs.verbose,
        httpsEnabled:true,
        enableLocalPeerDiscovery:program.peerDiscovery,
        peerDiscoveryPort:parseInt(configs.port) - 2000,
      })

     node.startServer()
     .then( started =>{
      if(started.error) throw new Error(started.error)

      if(program.join){
        node.joinPeers();
      }
  
      if(program.seed){
        node.connectToPeer(program.seed);
      }
     })
     
      
  });

program.parse(process.argv)

process.on('SIGINT', () => {
  logger('Shutting down node and saving state');
  

  if(process.MINER){
    logger('Stopping miner');
    process.ACTIVE_MINER.kill()
  }

  // node.closeNode()
  
  node.save()
  .then((saved)=>{
    if(saved){
      process.exit()
    }
  })
  .catch(e=> console.log(e))
  

});

