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
        this.networks = {}
    }

    async init(){
        try{
            let networkConfig = new NetworkConfig()
            let configString = await networkConfig.loadNetworkConfig()
            this.configs = networkConfig
            if(configString){
                if(configString.error) return { error:configString.error }
                let configs = JSON.parse(configString)
                this.networks = configs.networks
                logger('Loaded network configurations')
                return true
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

    async getNetwork(network){
        return this.configs.getNetwork(network)
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