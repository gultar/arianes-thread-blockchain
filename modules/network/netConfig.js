const { readFile, writeToFile } = require('../tools/utils')
const fs = require('fs')
class NetworkConfig{
    constructor({ network, seeds }){
        this.network = network
        this.token = {}
        this.path = './config/'+network+'.json'
        this.seeds = seeds || {}
    }

    async loadNetworkConfig(){
        try{
            let exists = fs.existsSync(this.path)
            if(exists){
                let file = await readFile(this.path)
                if(file){
                    return file
                }else{
                    return { error:'ERROR Could not load network config file' }
                }
            }else{
                let saved = await this.saveNetworkConfig()
                return saved
            }
        }catch(e){
            return { error:e.message }
        }
    }

    async saveNetworkConfig(){
        try{
            let saved = await writeToFile(this, this.path)
            if(saved){
                if(saved.error) return { error:saved.error }
                return this
            }else{
                return { error:'ERROR: Could not save network config file' }
            }
        }catch(e){
            return { error:e.message }
        }
    }


}

module.exports = NetworkConfig
