const NetworkConfig = require('./networkConfig')
const NetworkToken = require('./networkToken')
const genesis = require('../tools/getGenesis')
const { saveGenesisFile } = require('../classes/genesisBlock')
const { readFile, writeToFile, logger } = require('../tools/utils')

class NetworkManager{
    constructor(){
        this.genesis = genesis
        this.currentNetwork = genesis.network || 'mainnet'
        this.configs = {}
    }

    async init(){
        try{
            this.configs = new NetworkConfig() 
            let loaded = await this.configs.loadNetworkConfig()
            if(loaded){
                if(loaded.error) return { error:loaded.error }
                logger('Loaded network configurations')
                return loaded
            }else{
                return { error:'ERROR: Could not initialize network manager' }
            }
        }catch(e){
            return { error:e.message }
        }
        
    }

    async createNetwork(config){
        if(!config) config = genesis
        let token = new NetworkToken(config)
        let added = await this.configs.addNetwork(token)
        let joined = await this.joinNetwork(token.network)
        if(joined.error) return { error:joined.error }
        else return joined
    }

    async addNetwork(networkToken){
        let added = this.configs.addNetwork(networkToken)
        return added
    }

    getNetwork(network=genesis.network){
        let networkToken = this.configs.getNetwork(network)
        return networkToken
    }

    async joinNetwork(network){
        let networkToken = this.configs.getNetwork(network)
        if(networkToken){
            let newGenesis = networkToken.config
            let saved = await saveGenesisFile(newGenesis)
            if(saved.error) return { error:saved.error } 
        }

        return saved
    }

    async save(){
        logger('Saving network configurations')
        return await this.configs.saveNetworkConfig()
    }
}

module.exports = NetworkManager