#!/usr/bin/env node


const program = require('commander');
const { logger, readFile } = require('./modules/tools/utils');
const fs = require('fs')
const genesis = require('./modules/tools/getGenesis')
const publicIP = require('public-ip')
const activePort = require('dotenv').config({ path: './config/.env' })



if (activePort.error) {
    throw activePort.error
}

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
  .option('-i, --ipaddress <hostname>', 'Specify node hostname')
  .option('-p, --port <port>', 'Specify node port')
  .option('-s, --seeds <seeds>', 'Seed nodes to initiate p2p connections')
  .option('-v, --verbose', 'Enable transaction and network verbose')
  .option('-d, --peerDiscovery [type]', 'Enable peer discovery using various methods')
  .option('-t, --peerDiscoveryPort <port>', 'Enable peer discovery using various methods')
  .option('-l, --dhtDisconnectDelay <delay>', 'Length of time after which the node disconnects from dht network')
  .option('-m, --mine', 'Start a block miner child process alongside the node')
  .option('-g, --generate', 'Generate blocks for validation, instead of mining')
  .option('-c, --clusterMiner [numbers]', 'Launch a cluster of miners. Default: 1 workers')
  .option('-w, --walletName <walletName>', 'Name of the miner wallet')
  .option('-k, --password <password>', 'Password needed to unlock wallet')
  .option('-x, --exposeHTTP', 'Expose HTTP API to allow external interaction with blockchain node')
  .option('-n, --network <network>', 'Blockchain network to join')
  .option('-N, --networkPassword <networkPassword>', 'Password required to join network')
  .option('-a, --allowLocalhost', 'Allow connections on the same machine. Default: false')
  .option('-L, --localhost', 'Run on localhost only')

program
  .command('start')
  .usage('node blockchainCLI.js start --option [value]')
  .description('Starts blockchain node')
  .action(async ()=>{

      let lanHost = await getIP()
    
      if(!program.ipaddress){
        
        let ip = await getIP()
        if(ip.error){
          console.log('IP ERROR: ', ip.error)
          
        }else{
          program.ipaddress = ip
        }

        if(program.peerDiscovery == 'dht'){
          program.ipaddress = await publicIP.v4()
        }
      }

      if(program.localhost){
        program.ipaddress = '127.0.0.1'
        program.allowLocalhost = true
        lanHost = '127.0.0.1'
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

      let figlet = require('figlet')
      let chalk = require('chalk')
      console.log(chalk.green(figlet.textSync('Tisserand.js')))

      let network = program.network || 'mainnet'

      global.NETWORK = network

      
      let mempoolInstanciated = require('./modules/instances/mempool')
      let tablesInstanciated = require('./modules/instances/tables')
      let blockchainInstanciated = require('./modules/instances/blockchain')

      let { blockchain } = blockchainInstanciated
      let { mempool } = mempoolInstanciated
      
      let mempoolStarted = await mempool.init()
      let blockchainStarted  = await blockchain.init()

      let blockRuntimeInstanciated = require('./modules/instances/blockRuntime')
      const Node = require('./node');


      node = new Node({
        host:program.ipaddress ? program.ipaddress : configs.host,
        lanHost:lanHost,
        port:program.port ? program.port : configs.port,
        verbose:configs.verbose,
        httpsEnabled:true,
        exposeHTTP:program.exposeHTTP || false,
        enableLocalPeerDiscovery:discovery.local,
        enableDHTDiscovery:discovery.dht,
        peerDiscoveryPort:activePort.parsed.DHT_PORT||parseInt(configs.port) - 2000,
        network:network,
        noLocalhost:(program.allowLocalhost ? false : true),
        genesis:genesis,
        minerWorker:false,
        clusterMiner:program.clusterMiner,
        keychain:program.keychain,
        networkPassword:program.networkPassword
      })

     node.startServer()
     .then( started =>{
        if(started.error) throw new Error(started.error)

        if(program.mine){
          let walletName = program.walletName;
          let walletPassword = program.password;
          if(!walletName || !walletPassword){
            console.log('Could not start miner process: missing walletName or password')
          }else{
            const { Worker } = require('worker_threads');
            let worker = new Worker(`
            let Miner = require(__dirname+'/modules/classes/mining/miner/miner')
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

        if(program.generate){
          let walletName = program.walletName;
          let walletPassword = program.password;
          if(!walletName || !walletPassword){
            console.log('Could not start miner process: missing walletName or password')
          }else{
            const { Worker } = require('worker_threads');
            let worker = new Worker('./modules/classes/producing/launchProducer.js', { 
              workerData: {
                walletName:walletName,
                password:walletPassword,
                nodeAddress:`${'http://localhost:'+node.minerPort}`,
                verbose:program.verbose
              } 
            })
            
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

let timesPressed = 0

process.on('SIGINT', async () => {
  if(!node.chain.isLoadingBlocks){
    logger('Shutting down node and saving state');
    let { vmBox } = require('./modules/instances/vmbox')
    timesPressed++
    if(timesPressed == 2) process.exit(0)

    if(process.MINER){
      logger('Stopping miner');
      process.ACTIVE_MINER.kill()
    }
  
    if(node.chain.worker){
      node.chain.stopVmController()
    }
    else{
      vmBox.stop()
    }

    let saved = await node.save()
    .catch(e=>{
       console.log(e)
       process.exit()
      })
    process.exit()
  }else{
    logger('Cannot stop while loading blocks')
  }
  

});












