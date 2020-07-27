const genesis = require('./getGenesis')
const sha256 = require('./sha256')

module.exports = getGenesisConfigHash = () => {
    let genesisString = JSON.stringify(genesis)
    return sha256(genesisString)
}