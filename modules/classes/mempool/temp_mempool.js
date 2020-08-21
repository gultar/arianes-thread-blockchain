// const Database = require('./database')
const Database = require('../database/db')
const jsonSize = require('json-size');
const EventEmitter = require('events')
const { logger } = require('../../tools/utils')

class Mempool{
    constructor(){
        this.transactions = new Database('transactionsPool')
        this.actions = new Database('actionsPool')
        this.deferredTransactions = new Database('deferredTransactionsPool')
        this.deferredActions = new Database('deferredActionsPool')
        this.delayedTransactions = {}
        this.delayedActions = {}
        this.maxBatchSize = 1024 * 1024 * 10;
        this.busyGathering = false
        this.events = new EventEmitter()
    }

    async manageDeferredTransactions(latestBlock){
        if(latestBlock && latestBlock.blockNumber >= 0){
            
            let numTransactionAdded = 0
            if(latestBlock.blockNumber >= 1){
                for await(let hash of Object.keys(this.delayedTransactions)){
                    let transaction = this.delayedTransactions[hash]
                    if(transaction.delayToBlock <= latestBlock.blockNumber){
                        console.log('Managed', transaction)
                        delete transaction.delayToBlock
                        let added = await this.addTransaction(transaction)
                        if(added.error) return { error: { delayedTransactionError:added.error } }
    
                        numTransactionAdded++
                    }
                }
            }

            return { delayedTransactionsAdded:numTransactionAdded };
        }else{
            return { error:'DELAYED TX ERROR: Need to provide valid latest block' }
        }
        
    }

    loadMempool(){
        return new Promise(async (resolve)=>{
            let txEntry = await this.transactions.getAll()
            let actionEntry = await this.actions.getAll()
            
            if(txEntry && txEntry.length){
                for await(let index of txEntry){
                    let hash = index._id
                    this.txReceipts[hash] = index[hash]
                }
            }
            if(actionEntry && actionEntry.length){
                for await(let index of actionEntry){
                    let hash = index._id
                    this.actionReceipts[hash] = index[hash]
                }
            }

            resolve({ loadedTxReceipts:this.txReceipts, loadedActionsReceipts:this.actionReceipts })
        })
    }
}