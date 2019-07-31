/**
 TFLB | Thousandfold Blockchain
 @author: Sacha-Olivier Dulac
*/

const fs = require('fs')
const { logger, readFile, writeToFile, createFile, merge } = require('../tools/utils')
const {isValidTransactionJSON} = require('../tools/jsonvalidator')
const Transaction = require('./transaction')

class Mempool{
    constructor(){
        this.pendingTransactions = {};
        this.rejectedTransactions = {};
        this.pendingCoinbaseTransactions = {};
        this.pendingActions = {};
        this.maxBatchSize = 50000
        this.busyGathering = false
    }

    addTransaction(transaction){
        try{
            if(transaction && transaction.hasOwnProperty('hash')){
                if(!this.pendingTransactions[transaction.hash]){
                    this.pendingTransactions[transaction.hash] = transaction;
                }
            }
            
        }catch(e){
            console.log(e);
        }
        
    }

    addCoinbaseTransaction(transaction){
        if(transaction){
            try{
                if(transaction && transaction.hasOwnProperty('hash')){
                    if(!this.pendingCoinbaseTransactions[transaction.hash]){
                        this.pendingCoinbaseTransactions[transaction.hash] = transaction;
                    }
                }
                
            }catch(e){
                console.log(e);
            }
        }else{
            logger('ERROR: Could not add new coinbase transaction')
        }
        
    }

    addAction(action){
        try{
            if(action && action.hasOwnProperty('hash')){
                if(!this.pendingActions[action.hash]){
                    this.pendingActions[action.hash] = action;
                }
            }
            
        }catch(e){
            console.log(e);
        }
        
    }

    getCoinbaseTransaction(hash){
        if(hash && typeof hash == 'string'){
            return this.pendingCoinbaseTransactions[hash];
        }else{
            return false;
        }
    }

    moveCoinbaseTransactionToPool(hash){
        if(hash && typeof hash == 'string'){
            let transaction = this.pendingCoinbaseTransactions[hash];
            this.pendingTransactions[hash] = transaction;
            delete this.pendingCoinbaseTransactions[hash];
            logger(`Moved coinbase transaction ${hash.substr(0, 15)} to pool`)
            
            return true;
        }else{
            return false;
        }
    }


    deleteCoinbaseTransaction(hash){
        if(hash && this.pendingCoinbaseTransactions[hash]){
            delete this.pendingCoinbaseTransactions[hash];
        }
    }

    deleteActions(hash){
        if(hash && this.pendingActions[hash]){
            delete this.pendingActions[hash];
        }
    }

    rejectCoinbaseTransaction(hash){
        if(hash && this.pendingCoinbaseTransactions[hash]){
            this.rejectCoinbaseTransaction[hash] = this.pendingCoinbaseTransactions[hash];
            delete this.pendingCoinbaseTransactions[hash];
        }
    }

    rejectTransaction(hash){
        if(hash && this.pendingTransactions[hash]){
            this.rejectedTransactions[hash] = this.pendingTransactions[hash];
            delete this.pendingTransactions[hash];
        }
    }

    rejectBlockTransaction(transaction){
        if(transaction && isValidTransactionJSON(transaction)){
            this.rejectedTransactions[transaction.hash] = transaction;
        }
    }

    getTransactionFromPool(hash){
        if(hash && typeof hash == 'string'){
            return this.pendingTransactions[hash];
        }else{
            return false;
        }
    }

    sizeOfPool(){
        return Object.keys(this.pendingTransactions).length;
    }

    sizeOfActionPool(){
        return Object.keys(this.pendingActions).length;
    }

    gatherTransactionsForBlock(){
        if(this.busyGathering) {
            return false
        }else{
            return new Promise(async(resolve)=>{
                if(this.pendingTransactions && Object.keys(this.pendingTransactions).length > 0){
                    let transactions = JSON.parse(JSON.stringify(this.pendingTransactions));
                    let batch = {}
                    if(this.calculateSizeOfBatch(transactions) <= this.maxBatchSize){
                        batch = transactions
                        this.busyGathering = false
                    }else{
                        batch = await this.gatherPartialBatch(transactions);
                        this.busyGathering = false
                    }
                    resolve(batch);
                }else{
                    resolve(false)
                }
                
            })
        }
        
    }

    gatherPartialBatch(transactions){
        return new Promise((resolve)=>{
            this.busyGathering = true
            let hashes = Object.keys(transactions);
            let batch = {};
            
            for(var hash of hashes){
                if(this.calculateSizeOfBatch(batch) <= this.maxBatchSize){
                    batch[hash] = transactions[hash];
                }
            }
            logger(`Gathering a batch of ${Object.keys(batch).length} transactions`)
            resolve(batch)
            
        })
        
    }

    gatherActionsForBlock(){
        return new Promise(async(resolve)=>{
            if(this.pendingActions && Object.keys(this.pendingActions).length > 0){
                let actions = JSON.parse(JSON.stringify(this.pendingActions));
                let batch = {}
                if(this.calculateSizeOfBatch(actions) <= this.maxBatchSize){
                    batch = actions
                }else{
                    batch = await this.gatherPartialBatch(actions);
                }
                batch = await this.orderTransactionsByTimestamp(batch)
                resolve(batch);
            }else{
                resolve(false)
            }
            
        })
        
    }

    calculateSizeOfBatch(transactions){
        return Transaction.getTransactionSize(transactions)
    }

    

    deleteTransactionsFromMinedBlock(transactions){
        return new Promise((resolve)=>{
            if(typeof transactions == 'object'){
                let txHashes = Object.keys(transactions);
            
                for(var hash of txHashes){
                    if(this.pendingTransactions.hasOwnProperty(hash)){
                        delete this.pendingTransactions[hash];
                    }
                }
                resolve(true)
            }else{
                logger('ERROR: Transactions to delete are undefined')
                resolve(false)
            }
        })
    }

    deleteActionsFromMinedBlock(actions){
        return new Promise((resolve)=>{
            if(typeof actions == 'object'){
                let actionHashes = Object.keys(actions);
            
                for(var hash of actionHashes){
                    if(this.pendingActions.hasOwnProperty(hash)){
                        delete this.pendingActions[hash];
                    }
                }
                resolve(true)
            }else{
                logger('ERROR: Actions to delete are undefined')
                resolve(false)
            }
        })
        
        
    }

    putbackPendingTransactions(transactions){
        
        if(typeof transactions == 'object'){
            for(var txHash of Object.keys(transactions)){
                this.pendingTransactions[txHash] = transactions[txHash];
            }
        }else{
            logger('ERROR: Transactions to putback are undefined')
        }
        
    }

    putbackPendingActions(actions){
        
        if(typeof transactions == 'object'){
            for(var actionHash of Object.keys(actions)){
                this.pendingActions[actionHash] = actions[actionHash];
            }
        }else{
            logger('ERROR: Actions to putback are undefined')
        }
        
    }

    orderTransactionsByTimestamp(transactions){
        if(typeof transactions == 'object'){
            let txHashes = Object.keys(transactions);
            let orderedTransaction = {};
            let txAndTimestamp = {};
    
            if(txHashes){
              txHashes.forEach( hash =>{
                let transaction = transactions[hash];
                txAndTimestamp[transaction.timestamp] = hash;
              })
    
              let timestamps = Object.keys(txAndTimestamp);
              timestamps.sort(function(a, b){return a-b});
              timestamps.forEach( timestamp=>{
                let hash = txAndTimestamp[timestamp];
                let transaction = transactions[hash];
                orderedTransaction[hash] = transaction;
              })
    
              return orderedTransaction;
    
            }
    
        }
      }

    async loadMempool(){
        return new Promise((resolve, reject)=>{
            fs.exists('./data/mempool.json', async (exists)=>{
                if(!exists){
                    resolve(await this.createMempool().catch(e =>{ { console.log(e) } }))
                }

                let mempoolFile = await readFile('./data/mempool.json').catch(e =>{ { console.log(e) } })
                if(mempoolFile){
                    try{
                        let oldMempool = JSON.parse(mempoolFile);
                        let oldTransactionPool = oldMempool.pendingTransactions;
                        let oldRejectedTransactions = oldMempool.rejectedTransactions;
                        let oldCoinbaseTransactions = oldMempool.pendingCoinbaseTransactions;
                        let oldActions = oldMempool.pendingActions;
                        
                        let newTransactionPool = merge(oldTransactionPool, this.pendingTransactions);
                        let newRejectedTransactions = merge(oldRejectedTransactions,this.rejectedTransactions);
                        let newPendingCoinbaseTransactions = merge(oldCoinbaseTransactions,this.pendingCoinbaseTransactions)
                        let newActions = merge(oldActions, this.pendingActions);

                        this.pendingTransactions = newTransactionPool;
                        this.rejectedTransactions = newRejectedTransactions;
                        this.pendingCoinbaseTransactions = newPendingCoinbaseTransactions;
                        this.pendingActions = newActions;

                        resolve(true)
                    }catch(e){
                        console.log(e)
                        resolve(false)
                    }
                    
                }
            })
            
        })
        
    }

    async saveMempool(){
        return new Promise(async (resolve, reject)=>{
            try{
                
                
                let saved = await writeToFile(this, './data/mempool.json');
                if(saved){
                    logger('Saved mempool');
                    resolve(true)
                }else{
                    reject('ERROR: Could not save mempool')
                }  
            }catch(e){
               reject(e) 
            }
             
        })
        
    }

    async createMempool(){
        return new Promise(async (resolve, reject)=>{
            let created = await createFile(this, './data/mempool.json').catch(e =>{ { console.log(e) } })
            if(created){
                logger('Created mempool file');
                resolve(true)
            }else{
                logger('ERROR: Could not create mempool file')
                resolve(false)
            }
        })
        
    }
}


module.exports = new Mempool();