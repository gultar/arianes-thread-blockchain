const ioClient = require('socket.io-client')
const { logger } = require('../tools/utils')
const BalanceTable = require('../classes/tables/balanceTable')
const AccountTable = require('../classes/tables/accountTable')
const ContractTable = require('../classes/tables/contractTable')

class ChainAPIClient{
    constructor(port){
        this.chain = []
        this.apiPort = port
        this.client = {}
        this.connected = false
        this.accountTable = new AccountTable()
        this.balance = new BalanceTable(this.accountTable)
        this.contractTable = {}
    }

    connect(address){
       return new Promise((resolve)=>{
            this.client = ioClient(address)
            this.client.on('connect', async()=>{
                await this.start()
                resolve({connected:true})
            })
       })
    }

    async start(){
        logger('Chain client connected')
            this.client.emit('getChain')
            this.client.once('chain', (chain)=> { this.chain = chain })
            
            this.client.emit('getSnapshot')
            this.client.once('snapshot', (snapshot)=>{ this.chainSnapshot = snapshot })
            this.connected = true

            let latestBlock = await this.getLatestBlock()
            let savedBalances = await this.balance.loadBalances(latestBlock.blockNumber)
            if(savedBalances.error) throw new Error(savedBalances.error)

            this.contractTable = new ContractTable({
                getCurrentBlock:()=>{
                    return this.chain[this.chain.length - 1]
                },
                getBlockFromHash:(hash)=>{
                    this.chain.forEach(block => {
                        if(block.hash === hash) return block
                    })

                    return false
                },
                getBlock:(blockNubmer)=>{
                    return this.chain[blockNumber]
                }
            })
            await this.contractTable.init()

            return { started:true }
    }

    getLatestBlock(){
        return new Promise((resolve)=>{
            this.client.emit('getLatestBlock')
            this.client.once('latestBlock', (block)=>{
                resolve(block)
            })
        })
    }

    getGenesisBlockFromDB(){
        return new Promise((resolve)=>{
            this.client.emit('getGenesisBlockFromDB')
            this.client.once('genesisBlockFromDB', (block)=> resolve(block))
        })
    }

    getNextBlockbyHash(hash){
        return new Promise((resolve)=>{
            this.client.emit('getNextBlockbyHash', hash)
            this.client.once('nextBlockByHash', (block)=> resolve(block))
        })
    }

    getBlockFromDB(blockNumber){
        return new Promise((resolve)=>{
            this.client.emit('getBlockFromDB', blockNumber)
            this.client.once('blockFromDB', (block)=> resolve(block))
        })
    }

    getBlockFromDBByHash(hash){
        return new Promise((resolve)=>{
            this.client.emit('getBlockFromDBByHash', hash)
            this.client.once('blockFromDBByHash', (block)=> resolve(block))
        })
    }

    getBlockHeader(blockNumber){
        return new Promise((resolve)=>{
            this.client.emit('getBlockHeader', blockNumber)
            this.client.once('blockHeader', (header)=> resolve(header))
        })
    }

    getIndexOfBlockHashInChain(hash){
        return new Promise((resolve)=>{
            this.client.emit('getIndexOfBlockHashInChain', hash)
            this.client.once('indexOfBlockHashInChain', (index)=> resolve(index))
        })
    }

    receiveBlock(block){
        return new Promise((resolve)=>{
            this.client.emit('receiveBlock', block)
            this.client.once('received', (received)=> resolve(received))
        })
    }

    extractHeader(block){
        return new Promise((resolve)=>{
            this.client.emit('extractHeader', block)
            this.client.once('header', (header)=> resolve(header))
        })
    }

    getIndexOfBlockHash(hash){
        return new Promise((resolve)=>{
            this.client.emit('getIndexOfBlockHash', hash)
            this.client.once('indexOfBlockHash', (index)=> resolve(index))
        })
    }

    validateTransaction(transaction){
        return new Promise((resolve)=>{
            this.client.emit('validateTransaction', transaction)
            this.client.once('isValidTransaction', (isValidTransaction)=> resolve(isValidTransaction))
        })
    }

    validateAction(action){
        return new Promise((resolve)=>{
            this.client.emit('validateAction', action)
            this.client.once('isValidAction', (isValidAction)=> resolve(isValidAction))
        })
    }

    validateBlockHeader(header){
        return new Promise((resolve)=>{
            this.client.emit('validateBlockHeader', header)
            this.client.once('isValidHeader', (isValidHeader)=> resolve(isValidHeader))
        })
    }

    getBlockbyHash(hash){
        return new Promise((resolve)=>{
            this.client.emit('getBlockbyHash', hash)
            this.client.once('blockByHash', (block)=> resolve(block))
        })
    }

    isChainValid(){
        return new Promise((resolve)=>{
            this.client.emit('isChainValid')
            this.client.once('valid', (validity)=>{
                resolve(validity)
            })
        })
    }

    testCall(call){
        return new Promise((resolve)=>{
            this.client.emit('testCall', call)
            this.client.once('result', (result)=>{
                resolve(result)
            })
        })
    }

    save(){
        return new Promise((resolve)=>{
            this.client.emit('save')
            this.client.once('saved', (saved)=>{
                resolve(saved)
            })
        })
    }

    saveLastKnownBlockToDB(){
        return new Promise((resolve)=>{
            this.client.emit('saveLastKnownBlockToDB')
            this.client.once('savedLastBlock', (saved)=>{
                resolve(saved)
            })
        })
    }

    createTransaction(raw){
        return new Promise((resolve)=>{
            this.client.emit('createTransaction', raw)
            this.client.once('transaction', (transaction)=>{
                resolve(transaction)
            })
        })
    }

}

module.exports = ChainAPIClient
