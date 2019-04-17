const fs = require('fs')
const { logger, readFile, writeToFile, createFile, merge } = require('./utils')

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
                }else{
                    logger('Cannot overwrite transaction in pool');
                }
            }
            
        }catch(e){
            console.log(e);
        }
        
    }

    gatherTransactionsForBlock(){

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

    mergePools(oldPool, currentPool){
        try{
            
            let oldPoolHashes = Object.keys(oldPool);
            let currentPoolHashes = Object.keys(currentPool);

            oldPoolHashes.forEach( hash =>{
                
                if(!currentPool[hash]){
                    currentPool[hash] = oldPool[hash];
                }
            })
        }catch(e){
            console.log(e)
        }
        
        
    }

    async saveMempool(){
        let mempoolFile = await readFile('mempool.json').catch(e =>{ { console.log(e) } })
        if(mempoolFile){
            try{
                let oldMempool = JSON.parse(mempoolFile);
                let newMempool = {}
                let oldTransactionPool = oldMempool.pendingTransactions;
                let oldRejectedTransactions = oldMempool.rejectedTransactions
                let newTransactionPool = merge(oldTransactionPool, this.pendingTransactions);
                let newRejectedTransactions = merge(oldRejectedTransactions,this.rejectedTransactions);

                newMempool.pendingTransactions = newTransactionPool;
                newMempool.rejectedTransactions = newRejectedTransactions;

                let saved = await writeToFile(newMempool, 'mempool.json');
                if(saved){
                  logger('Saved mempool');
                }else{
                  logger('ERROR: Could not save mempool')
                }
                
            }catch(e){
                console.log(e);
            }
        }else{
            this.createMempool();
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
const tryOut = async ()=>{
    let m = new Mempool();
    m.pendingTransactions['hello'] = 'world';
    m.pendingTransactions['booga'] = 'booga';
    let myTx = new Transaction('hello', 'bitch', 0, '');
    
    m.addTransaction(myTx);
    m.pendingTransactions[myTx.hash].amount = 10;
    console.log(m.pendingTransactions[myTx.hash])

    
    
    

    let tx = {
        'bingo':'solo',
        'hello':'world',
        'booga':'booga'
    }
    
}

// tryOut()

module.exports = Mempool;