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
                    Object.freeze(this.pendingTransactions[transaction.hash]);
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
        console.log('About to mine '+Object.keys(transactions).length+' transactions');
        this.deleteTransactionsFromMinedBlock(transactions);
        return transactions;
    }

    deleteTransactionFromHash(hash){
        if(this.pendingTransactions[hash]){
            delete this.pendingTransactions[hash];
        }
    }

    deleteTransactionsFromMinedBlock(transactions){
        let txHashes = Object.keys(transactions);
        
        txHashes.forEach( hash =>{
            this.deleteTransactionFromHash(hash);
        })
    }

    putbackPendingTransactions(block){
        for(var txHash in Object.keys(block.transactions)){
            this.pendingTransactions[txHash] = block.transactions[txHash];
            delete block.transactions[txHash];
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


module.exports = new Mempool();