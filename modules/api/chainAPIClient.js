const ioClient = require('socket.io-client')
const { logger } = require('../tools/utils')
const BalanceTable = require('../classes/tables/balanceTable')
const AccountTable = require('../classes/tables/accountTable')

class ChainAPIClient{
    constructor(port){
        this.chain = []
        this.apiPort = port
        this.client = {}
        this.connected = false
        this.accountTable = new AccountTable()
        this.balance = new BalanceTable(this.accountTable)
        
    }

    async connect(address){
        

        this.client = ioClient(address)
        this.client.on('connect', async ()=>{
            logger('Chain client connected')
            this.client.emit('getChain')
            this.client.once('chain', (chain)=> { this.chain = chain })
            
            this.client.emit('getSnapshot')
            this.client.once('snapshot', (snapshot)=>{ this.chainSnapshot = snapshot })
            this.connected = true

            let latestBlock = await this.getLatestBlock()
            let savedBalances = await this.balance.loadBalances(latestBlock.blockNumber)
            if(savedBalances.error) throw new Error(savedBalances.error)
        })
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

/**
 * 
 * * getGenesisBlockFromDB()
 * getLatestBlock().hash
 * getIndexOfBlockHashInChain(hash)
 * getNextBlockbyHash(hash)
 * getBlockFromDB(nextBlock.blockNumber)
 * getBlockFromDBByHash(blockIndex);
 * getBlockHeader(blockNumber);
 * getTotalDifficulty()
 * this.chain.chain.length
 * rollbackToBlock(blockNumber - 1)
 * receiveBlock(block)
 * extractHeader(latestFullBlock)
 * validateBlockHeader(bestBlockHeader);
 * getIndexOfBlockHash(block.previousHash)
 * validateTransaction(transaction)
 * validateAction(action)
 * getBlockbyHash(block.hash)
 * isChainValid()
 */