const Database = require('../database/db')
const Blockchain = require('./chain')
const { workerData, parentPort } = require('worker_threads')

class BlockRunner{
    constructor(chain){
        this.pool = new Mempool()
        this.chain = new Blockchain()
    }
}