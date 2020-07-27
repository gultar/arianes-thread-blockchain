const fs = require('fs')
const { createGenesisBlock } = require('../classes/genesisBlock')
let genesis = {}
let path = './config/genesis.json'
const getGenesis = ()=>{
    if(process.GENESIS){
        return process.GENESIS
    }else{
        if(fs.existsSync(path)){
            genesis = JSON.parse(fs.readFileSync(path, 'utf8'))
        }else{
            genesis = createGenesisBlock()
            let saved = fs.writeFileSync(path, JSON.stringify(genesis, null, 2))
        }
    }

    return genesis
}

module.exports = getGenesis()

