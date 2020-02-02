const NetworkToken = require('./networkToken')
const genesis = require('../tools/getGenesis')
const { readFile, writeToFile } = require('../tools/utils')

class NetworkConfig{
    constructor(){
        this.networks = {}
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
                this.networks = JSON.parse(file).networks
                return file
            }else{
                let token = new NetworkToken(genesis)
                this.networks[genesis.network] = token
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
