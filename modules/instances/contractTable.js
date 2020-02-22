let { blockchain } = require('./blockchain')
let ContractTable = require('../classes/tables/contractTable')

console.log(blockchain)

module.exports = {
    contractTable: new ContractTable({
        getCurrentBlock:async ()=>{
            return await blockchain.getLatestBlock()
          },
        getBlock:(number)=>{
            return blockchain.chain[number]
        },
    })
}