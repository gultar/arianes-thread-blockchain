const genesis = require('../tools/getGenesis')
const getGenesisConfigHash = require('../tools/genesisConfigHash')

class NetworkToken{
    constructor(options){
        if(!options) options = genesis
        let { network, consensus, genesisConfigHash, genesisConfig } = options
        this.network = network || genesis.network
        this.consensus = consensus || genesis.consensus
        this.genesisConfigHash = genesisConfigHash || getGenesisConfigHash()
        this.genesisConfig = genesisConfig || genesis
        this.seedNodes = {}
    }
}

module.exports = NetworkToken