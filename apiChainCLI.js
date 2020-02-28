const ChainAPI = require('./modules/api/chainAPI')
const ChainAPIClient = require('./modules/api/chainAPIClient')
const program = require('commander')
const NetworkManager = require('./modules/network/networkManager')
const { Worker } = require('worker_threads')
const vmController = require('./modules/classes/contracts/vmController')
const contractTable = require('./modules/classes/tables/contractTable')

program
.option('-n, --network <network>')

program
.command('start')
.action(async ()=>{
  let network = program.network || 'mainnet'
  let manager = new NetworkManager(network)
  let initiated = await manager.init()
  let token = await manager.getNetwork(network)
  let joined = await manager.joinNetwork(token)
  let chainThread = new Worker(`
  const run = async () =>{
    const ChainAPI = require(__dirname+'/modules/api/chainAPI')
    process.NETWORK = '${program.network}'
    let api = new ChainAPI()
    let started = await api.init()
  }

  run()

  `, { eval:true })
  let client = new ChainAPIClient()
  client.connect('http://localhost:8500')
  
})

program.parse(process.argv)