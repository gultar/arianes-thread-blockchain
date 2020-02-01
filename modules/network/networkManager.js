const NetworkConfig = require('./networkConfig')
const NetworkToken = require('./networkToken')
const genesis = require('../tools/getGenesis')
const { saveGenesisFile } = require('../classes/genesisBlock')

class NetworkManager{
    constructor(){
        this.config = new NetworkConfig()
        this.genesis = genesis
        this.currentNetwork = genesis.network || 'mainnet'
    }

    async init(){
        let loaded = await this.config.loadNetworkConfig()
        if(loaded.error) return { error:loaded.error }
        else return loaded
    }

    async addNetwork(networkToken){
        let added = this.config.addNetwork(networkToken)
    }

    async joinNetwork(networkName){
        let networkToken = this.config.getNetwork(networkToken.network)
        if(networkToken){
            let newGenesis = networkToken.config
            let saved = await saveGenesisFile(newGenesis)
        }

        return saved
    }
}

const run = async () =>{
    let manager = new NetworkManager()

    let loaded = await manager.init()
    console.log('Loaded',loaded)

    let mainnetBuf = require('fs').readFileSync('./config/genesisbackup.json')
    let mainnet = mainnetBuf.toString()

    let token = new NetworkToken(mainnet)

    await manager.joinNetwork(token)

}

run()