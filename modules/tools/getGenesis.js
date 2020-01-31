const fs = require('fs')
const Blockchain = require('../classes/blockchain/chain')
let genesis = {}
if(fs.existsSync('./config/genesis.json')){
    genesis = JSON.parse(fs.readFileSync('./config/genesis.json', 'utf8'))
}else{
    let _tempChain = new Blockchain()
    genesis = _tempChain.createGenesisBlock()
}

module.exports = genesis


