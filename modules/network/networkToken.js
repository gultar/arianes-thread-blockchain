const genesis = require('../tools/getGenesis')
const getGenesisConfigHash = require('../tools/genesisConfigHash')

class NetworkToken{
    constructor(){
        this.network = genesis.network
        this.consensus = genesis.consensus
        this.genesisConfigHash = getGenesisConfigHash()
        this.genesisConfig = genesis
    }
}

module.exports = NetworkToken