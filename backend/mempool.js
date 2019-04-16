const fs = require('fs')
const { logger, readFile, writeToFile, createFile, merge } = require('./utils')
class Mempool{
    constructor(){
        this.pendingTransactions = {};
        this.rejectedTransactions = {};
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
                    resolve(await this.createMempool().catch(e =>{ { logger(e) } }))
                }

                let mempoolFile = await readFile('mempool.json').catch(e =>{ { logger(e) } })
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
                        logger(e)
                        resolve(false)
                    }
                    
                }
            })
            
        })
        
    }

    async saveMempool(){
        let mempoolFile = await readFile('mempool.json').catch(e =>{ { logger(e) } })
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
            let created = await createFile(this, 'mempool.json').catch(e =>{ { logger(e) } })
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
    m.pendingTransactions['poubelle'] = 'hector';
    m.loadMempool().then(()=>{
        console.log(m)
    })
    
}

// tryOut()

module.exports = Mempool;