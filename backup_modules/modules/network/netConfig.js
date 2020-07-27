const NetworkToken = require('./networkToken')
const genesis = require('../tools/getGenesis')
const { readFile, writeToFile } = require('../tools/utils')
const fs = require('fs')

class NetworkConfig{
    constructor(network){
        this.network = network
        this.token = {}
        this.path = './config/'+network+".json"
    }

    getNetwork(){
        return this.token
    }

    async loadNetworkConfig(){
        try{
            let exists = fs.existsSync(this.path)
            if(exists){
                let file = await readFile(this.path)
                let config = JSON.parse(file)
                this.token = new NetworkToken(config)
                return config
            }else{
                let token = new NetworkToken(genesis)
                this.token = token
                let saved = await this.saveNetworkConfig()
                if(saved.error) return { error:saved.error }
                else return saved
            }
        }catch(e){
            return { error:e.message }
        }
    }

    async saveNetworkConfig(){
        try{
            let saved = await writeToFile(this.token, this.path)
            if(saved){
                if(saved.error) return { error:saved.error }
                return saved
            }else{
                return { error:'ERROR: Could not save network config file' }
            }
        }catch(e){
            return { error:e.message }
        }
    }


}

module.exports = NetworkConfig
