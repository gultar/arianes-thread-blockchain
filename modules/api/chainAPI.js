const http = require('http')
const express = require('express')
const socketIo = require('socket.io')
const Blockchain = require('../classes/blockchain/chain')
const Mempool = require('../classes/mempool/pool')
const genesis = require('../tools/getGenesis')
const { logger } = require('../tools/utils')

let CHAINAPI_PORT = 8500

class ChainAPI{
    constructor(options){
        this.mempool = new Mempool()
        this.chain = new Blockchain([], this.mempool)
        this.app = express()
        this.httpServer = http.createServer(this.app)
        this.server = socketIo(this.httpServer)
    }

    async init(){
        let started = await this.chain.init()
        if(started.error) throw new Error(started.error)

        logger('Chain API listening on port ', CHAINAPI_PORT)
        this.httpServer.listen(CHAINAPI_PORT, 'localhost')
        this.server.on('connection',(socket)=>{
            logger('Chain API connected')
            this.methods(socket)
        })
    }

    methods(socket){
        socket.on('getGenesisBlockFromDB', async ()=> socket.emit('genesisBlockFromDB', genesis))
        socket.on('getChain', ()=>{ socket.emit('chain', this.chain.chain) })
        socket.on('getSnapshot', ()=> { socket.emit('snapshot', this.chain.chainSnapshot) })
        socket.on('getLatestBlock', ()=>{ console.log('Someone requested latest block');socket.emit('latestBlock', this.chain.getLatestBlock()) })
        socket.on('getNextBlockbyHash', async(hash)=>{ socket.emit('nextBlockByHash', await this.chain.getNextBlockbyHash(hash)) })
        socket.on('getBlockFromDB', async(blockNumber)=>{ socket.emit('blockFromDB', await this.chain.getBlockFromDB(blockNumber)) })
        socket.on('getTransactionHistory', async(publicKey)=>{ socket.emit('transactionHistory', await this.chain.getTransactionHistory(publicKey)) })
        socket.on('getBlockFromDBByHash', async(hash)=>{ socket.emit('blockFromDBByHash', await this.chain.getBlockFromDBByHash(hash)) })
        socket.on('getBlockHeader', (blockNumber)=>{ socket.emit('blockHeader', this.chain.getBlockHeader(blockNumber)) });
        socket.on('getTotalDifficulty', ()=>{ socket.emit('totalDifficulty', this.chain.getTotalDifficulty()) });
        socket.on('getChainLength', ()=>{ socket.emit('chainLength', this.chain.chain.length) });
        socket.on('rollbackToBlock', async(blockNumber)=>{ socket.emit('rolledBack', await this.chain.rollbackToBlock(blockNumber)) })
        socket.on('receiveBlock', async(newBlock)=>{ socket.emit('received', await this.chain.receiveBlock(newBlock)) })
        socket.on('extractHeader', (block)=>{ socket.emit('header', this.chain.extractHeader(block)) })
        socket.on('validateBlockHeader', (header)=>{ socket.emit('isValidHeader', this.chain.validateBlockHeader(header)) })
        socket.on('getIndexOfBlockHash', (hash)=>{ socket.emit('indexOfBlockHash', this.chain.getIndexOfBlockHash(hash)) })
        socket.on('validateTransaction', async(transaction)=>{ socket.emit('isValidTransaction', await this.chain.validateTransaction(transaction)) })
        socket.on('createTransaction', async(transaction)=>{ socket.emit('transaction', await this.chain.createTransaction(transaction)) })
        socket.on('validateAction', async(action)=>{ socket.emit('isValidAction', await this.chain.validateAction(action)) })
        socket.on('getBlockByHash', async(hash)=>{ socket.emit('blockByHash', await this.chain.getBlockbyHash(hash)) })
        socket.on('isChainValid', ()=>{ socket.emit('valid', this.chain.isChainValid()) })
        socket.on('testCall', async (call)=>{ socket.emit('result', await this.chain.testCall(call)) })
        socket.on('getIndexOfBlockHashInChain', async (hash) => { socket.emit('indexOfBlockHashInChain', await this.chain.getIndexOfBlockHashInChain(hash)) })
        socket.on('save', async (call)=>{ socket.emit('saved', await this.chain.save()) })
        socket.on('saveLastKnownBlockToDB', async (call)=>{ socket.emit('savedLastBlock', await this.chain.saveLastKnownBlockToDB()) })
    }
}

module.exports = ChainAPI


/**
 * getGenesisBlockFromDB()
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
 * 
 * //-----Test and utility listeners
 * .contractTable.getContract(name)
 * contractTable.stateStorage[contractName]
 * this.chain.chain[blockNumber]
 * this.chain.accountTable.getAccount(name)
 * this.chain.accountTable.getAccountsOfKey(ownerKey)
 * this.chain.chainSnapshot
 * getActionFromDB(hash)
 * getTransactionFromDB(hash)
 * 
 */