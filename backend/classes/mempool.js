const fs = require('fs')
const { logger, readFile, writeToFile, createFile, merge } = require('../tools/utils')
const {isValidTransactionJSON} = require('../tools/jsonvalidator')

class Mempool{
    constructor(){
        this.pendingTransactions = {};
        this.rejectedTransactions = {};
        this.pendingCoinbaseTransactions = {};
        this.pendingActions = {}
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

    gatherTransactionsForBlock(){
        let transactions = this.pendingTransactions;
        return transactions;
    }

    gatherActionsForBlock(){
        let actions = this.pendingActions;
        return actions;
    }

    

    deleteTransactionsFromMinedBlock(transactions){
        
        if(typeof transactions == 'object'){
            let txHashes = Object.keys(transactions);
        
            for(var hash of txHashes){
                if(this.pendingTransactions.hasOwnProperty(hash)){
                    delete this.pendingTransactions[hash];
                }
            }
        }else{
            logger('ERROR: Transactions to delete are undefined')
        }
        
    }

    deleteActionsFromMinedBlock(actions){
        
        if(typeof actions == 'object'){
            let actionHashes = Object.keys(actions);
        
            for(var hash of actionHashes){
                if(this.pendingActions.hasOwnProperty(hash)){
                    console.log('Deleting action: ', hash)
                    delete this.pendingActions[hash];
                }
            }
        }else{
            logger('ERROR: Actions to delete are undefined')
        }
        
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
        let saved = await writeToFile(this, './data/mempool.json');
        if(saved){
            logger('Saved mempool');
        }else{
            logger('ERROR: Could not save mempool')
        }
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