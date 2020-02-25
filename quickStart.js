
const { logger, readFile } = require('./modules/tools/utils');
const fs = require('fs')
const genesis = require('./modules/tools/getGenesis')
const publicIP = require('public-ip')
const activePort = require('dotenv').config({ path: './config/.env' })



if (activePort.error) {
    throw activePort.error
}

const loadNodeConfig = () =>{
    return new Promise(async (resolve)=>{
      fs.exists('./config/nodesconfig.json', async (exists)=>{
        if(exists){
            let config = require('./config/nodesconfig.json')
            resolve(config)
        }else{
            logger('WARNING: No node config file found. Using default')
            let config = {
                host:'127.0.0.1',
                port:8000,
            }
            resolve(config)
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

const start = async () =>{
    let node;
    let figlet = require('figlet')
    let chalk = require('chalk')
    console.log(chalk.green(figlet.textSync('BlockQuarry.js')))
    const config = await loadNodeConfig()
    let network = configs.network || 'mainnet'
    
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

    let lanHost = await getIP()

    node = new Node({
        host: configs.host || lanHost,
        lanHost: lanHost,
        port: configs.port || '8000',
        verbose: configs.verbose || false,
        httpsEnabled: true,
        exposeHTTP: configs.exposeHTTP || false,
        enableLocalPeerDiscovery: configs.discovery || false,
        enableDHTDiscovery: configs.discovery || false,
        peerDiscoveryPort: activePort.parsed.DHT_PORT||parseInt(configs.port) - 2000,
        network: genesis.network,
        noLocalhost: (configs.allowLocalhost ? false : true),
        genesis: genesis,
        keychain: configs.keychain || false,
        networkPassword: configs.networkPassword || false
    })

      let started = await node.startServer()

      process.on('SIGINT', async () => {
        try{
            if(!blockchain.isLoadingBlocks){
                logger('Shutting down node and saving state');
                let { vmBox } = require('./modules/instances/vmbox')
            
                let saved = await node.save()
                
                process.exit()
              }else{
                logger('Cannot stop while loading blocks')
              }
        }catch(e){
            console.log(e)
            process.exit(0)
        }
        
      
      });

}

start()