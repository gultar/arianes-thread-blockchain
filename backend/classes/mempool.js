const fs = require('fs')
const { logger, readFile, writeToFile, createFile, merge } = require('../tools/utils')
const {isValidTransactionJSON} = require('../tools/jsonvalidator')

class Mempool{
    constructor(){
        this.pendingTransactions = {};
        this.rejectedTransactions = {};
        this.pendingCoinbaseTransactions = {};
    }

    addTransaction(transaction){
        try{
            if(transaction && transaction.hasOwnProperty('hash')){
                if(!this.pendingTransactions[transaction.hash]){
                    this.pendingTransactions[transaction.hash] = transaction;
                    // Object.freeze(this.pendingTransactions[transaction.hash]);
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

    

    deleteTransactionsFromMinedBlock(transactions){
        let txHashes = Object.keys(transactions);
        
        for(var hash of txHashes){
            if(this.pendingTransactions.hasOwnProperty(hash)){
                delete this.pendingTransactions[hash];
            }
        }
    }

    putbackPendingTransactions(transactions){
        for(var txHash of Object.keys(transactions)){
            this.pendingTransactions[txHash] = transactions[txHash];
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
                        
                        let newTransactionPool = merge(oldTransactionPool, this.pendingTransactions);
                        let newRejectedTransactions = merge(oldRejectedTransactions,this.rejectedTransactions);
                        let newPendingCoinbaseTransactions = merge(oldCoinbaseTransactions,this.pendingCoinbaseTransactions)
                        
                        this.pendingTransactions = newTransactionPool;
                        this.rejectedTransactions = newRejectedTransactions;
                        this.pendingCoinbaseTransactions = newPendingCoinbaseTransactions;
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