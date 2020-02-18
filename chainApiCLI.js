const ChainAPI = require('./modules/api/chainAPI')
const program = require('commander')
const NetworkManager = require('./modules/network/networkManager')

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
  process.NETWORK = program.network
  let api = new ChainAPI()
  let started = await api.init()

})

program.parse(process.argv)