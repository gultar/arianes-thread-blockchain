const fs = require('fs')
const { logger, readFile, writeToFile, createFile, merge } = require('../tools/utils')

class Mempool{
    constructor(){
        this.pendingTransactions = {};
        this.rejectedTransactions = {};
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

    sizeOfPool(){
        return Object.keys(this.pendingTransactions).length;
    }

    gatherTransactionsForBlock(){
        let transactions = this.pendingTransactions;
        return transactions;
    }

    

    deleteTransactionsFromMinedBlock(transactions){
        let txHashes = Object.keys(transactions);
        logger('Deleting '+txHashes.length+' transactions from pool');
        for(var hash of txHashes){
            if(this.pendingTransactions.hasOwnProperty(hash)){
                delete this.pendingTransactions[hash];
            }
        }
    }

    putbackPendingTransactions(transactions){
        logger('Number of transactions putback '+Object.keys(transactions).length)
        for(var txHash of Object.keys(transactions)){
            this.pendingTransactions[txHash] = transactions[txHash];
        }
    }

    async loadMempool(){
        return new Promise((resolve, reject)=>{
            fs.exists('mempool.json', async (exists)=>{
                if(!exists){
                    resolve(await this.createMempool().catch(e =>{ { console.log(e) } }))
                }

                let mempoolFile = await readFile('mempool.json').catch(e =>{ { console.log(e) } })
                if(mempoolFile){
                    try{
                        let oldMempool = JSON.parse(mempoolFile);
                        let oldTransactionPool = oldMempool.pendingTransactions;
                        let oldRejectedTransactions = oldMempool.rejectedTransactions
                        
                        let newTransactionPool = merge(oldTransactionPool, this.pendingTransactions);
                        let newRejectedTransactions = merge(oldRejectedTransactions,this.rejectedTransactions);
                        
                        this.pendingTransactions = newTransactionPool;
                        this.rejectedTransactions = newRejectedTransactions;
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
        let saved = await writeToFile(this, 'mempool.json');
        if(saved){
            logger('Saved mempool');
        }else{
            logger('ERROR: Could not save mempool')
        }
    }

    async createMempool(){
        return new Promise(async (resolve, reject)=>{
            let created = await createFile(this, 'mempool.json').catch(e =>{ { console.log(e) } })
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


module.exports = Mempool;