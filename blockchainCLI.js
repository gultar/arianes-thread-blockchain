#!/usr/bin/env node

const Node = require('./node');
const program = require('commander');
const { logger, readFile } = require('./modules/tools/utils');
const fs = require('fs')
const genesis = require('./modules/tools/getGenesis')
const publicIP = require('public-ip')


let node;



const loadNodeConfig = () =>{
  return new Promise(async (resolve)=>{
    fs.exists('./config/nodesconfig.json', async (exists)=>{
      if(exists){
        let nodeConfigString = await readFile('./config/nodesconfig.json');
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

const getIP = () =>{
  return new Promise((resolve)=>{
    const address = require('address')
    address(function (err, addrs) {
      if(err) resolve({error:err})
      else resolve(addrs.ip)
    });
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
  .option('-n, --hostname <hostname>', 'Specify node hostname')
  .option('-p, --port <port>', 'Specify node port')
  .option('-j, --join [network]', 'Joins network')
  .option('-s, --seeds <seeds>', 'Seed nodes to initiate p2p connections')
  .option('-v, --verbose', 'Enable transaction and network verbose')
  .option('-d, --peerDiscovery [type]', 'Enable peer discovery using various methods')
  .option('-t, --peerDiscoveryPort <port>', 'Enable peer discovery using various methods')
  .option('-l, --dhtDisconnectDelay <delay>', 'Length of time after which the node disconnects from dht network')
  .option('-m, --mine', 'Start a block miner child process alongside the node')
  .option('-c, --clusterMiner [numbers]', 'Launch a cluster of miners. Default: 1 workers')
  .option('-w, --walletName <walletName>', 'Name of the miner wallet')
  .option('-k, --password <password>', 'Password needed to unlock wallet')
  .option('-x, --exposeHTTP', 'Expose HTTP API to allow external interaction with blockchain node')

program
  .command('start')
  .usage('node blockchainCLI.js start --option [value]')
  .description('Starts blockchain node')
  .action(async ()=>{


    
    if(!program.hostname){
      
      let ip = await getIP()
      if(ip.error){
        console.log('IP ERROR: ', ip.error)
        
      }else{
        program.hostname = ip
      }

      if(program.peerDiscovery == 'dht'){
        program.hostname = await publicIP.v4()
      }
    }

      let configs = await loadNodeConfig();
      if(program.verbose){
        configs.verbose = true;
      }
    
      let discovery = {}
      if(program.peerDiscovery){
        
        switch(program.peerDiscovery){
          
          case 'local': 
            discovery = {
              local:true
            }
            break;
          case 'dht':
            discovery = {
              dht:true
            }
            break;
          default:
            discovery = {
              dht:true
            }
            break;
        }
      }
      if(program.clusterMiner){
        let walletName = program.walletName;
        let walletPassword = program.password;
        if(!walletName || !walletPassword){
          console.log('ERROR: Could not start miner process: missing walletName or password')
        }else{
          program.keychain = {
            name:program.walletName,
            password:program.password
          }
          
          
        }
      }
      node = new Node({
        host:program.hostname ? program.hostname : configs.host,
        port:program.port ? program.port : configs.port,
        verbose:configs.verbose,
        httpsEnabled:true,
        exposeHTTP:program.exposeHTTP || false,
        enableLocalPeerDiscovery:discovery.local,
        enableDHTDiscovery:discovery.dht,
        peerDiscoveryPort:parseInt(configs.port) - 2000,
        networkChannel:'mainnet',
        noLocalhost:true,
        genesis:genesis,
        minerWorker:false,
        clusterMiner:program.clusterMiner,
        keychain:program.keychain
      })

     node.startServer()
     .then( started =>{
      if(started.error) throw new Error(started.error)

      if(program.join){
        node.joinPeers();
      }

      

      if(program.mine){
        let walletName = program.walletName;
        let walletPassword = program.password;
        if(!walletName || !walletPassword){
          console.log('Could not start miner process: missing walletName or password')
        }else{
          const { Worker } = require('worker_threads');
          let worker = new Worker(`
          let Miner = require(__dirname+'/modules/classes/minerTools/miner')
          let miner = new Miner({
              publicKey:'',
              verbose:false,
              keychain:{ name:"${program.walletName}", password:"${program.password}" }
          })
          miner.connect("${'http://localhost:'+node.minerPort}")`, { eval: true })
          
          worker.on('error', error => {
            console.log(error)
          })
          worker.on('exit', (message)=> logger('Miner closed with node'))
        }

        
      }
  
      if(program.seeds){
        if(program.seeds.includes(';')){
          let seeds = program.seeds.split(';')
          for(let seed of seeds){
            node.connectToPeer(seed);
          }
        }else{
          node.connectToPeer(program.seeds)
        }
      }
     })
     
      
  });

program.parse(process.argv)

process.on('SIGINT', async () => {
  logger('Shutting down node and saving state');
  

  if(process.MINER){
    logger('Stopping miner');
    process.ACTIVE_MINER.kill()
  }

  node.chain.vmController.stop()

  
  
  let saved = await node.save()
  .catch(e=>{
     console.log(e)
     process.exit()
    })
  process.exit()

});












