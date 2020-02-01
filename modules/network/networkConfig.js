const NetworkToken = require('./networkToken')
const { readFile, writeToFile } = require('../tools/utils')

class NetworkConfig{
    constructor(){
        this.networks = {}
        this.peerStats = {}
        this.path = './config/networkConfig.json'
    }

    addNetwork(networkToken){
        this.networks[networkToken.network] = networkToken
    }

    getNetwork(networkName){
        return this.networks[networkName]
    }

    removeNetwork(networkName){
        delete this.networks[networkName]
        return { deleted:true }
    }

    async loadNetworkConfig(){
        try{
            let file = await readFile(this.path)
            if(file){
                return file
            }else{
                return { error:'ERROR Could not load network config file' }
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
                return saved
            }else{
                return { error:'ERROR: Could not save network config file' }
            }
        }catch(e){
            return { error:e.message }
        }
    }


}

// const run = async () =>{

//     let token = new NetworkToken()
//     let config = new NetworkConfig()
    
//     config.addNetwork(token)
    
//     await config.saveNetworkConfig()
    
//     console.log(await config.loadNetworkConfig())
    
// }

// run()

module.exports = NetworkConfig
