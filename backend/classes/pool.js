const Database = require('./database')
const jsonSize = require('json-size');


class Mempool{
    constructor(){
        this.transactions = new Database('./data/transactionDB')
        this.actions = new Database('./data/actionDB')
        this.txReceipts = {}
        this.actionReceipts = {}
        this.maxBatchSize = 50000
        this.busyGathering = false
    }

    addTransaction(transaction){
        return new Promise( async (resolve)=>{
            let added = await this.transactions.add({
                _id:transaction.hash,
                [transaction.hash]:transaction
            })
            if(added.error) resolve({error:added.error})
            else if(added){
                let receipt = await this.createTransactionReceipt(transaction)
                if(receipt.error) resolve({error:receipt.error})
                this.txReceipts[transaction.hash] = receipt
                resolve({added:true, receipt:receipt})
            }

            
        })
    }
    addAction(action){
        return new Promise( async (resolve)=>{
            let added = await this.actions.add({
                _id:action.hash,
                [action.hash]:action
            })
            if(added.error) resolve({error:added.error})
            else if(added){
                let receipt = await this.createActionReceipt(action)
                if(receipt.error) resolve({error:receipt.error})

                this.actionReceipts[action.hash] = receipt
                resolve({added:true, receipt:receipt})
            }
        })
    }

    getTransaction(hash){
        return new Promise(async (resolve)=>{
            let entry = await this.transactions.get(hash)

            if(entry){
                if(entry.error) resolve({error:entry.error})

                resolve(entry[hash])
            }else{
                resolve(false)
            }
        })
    }

    getAction(hash){
        return new Promise(async (resolve)=>{
            let entry = await this.actions.get(hash)

            if(entry){
                if(entry.error) resolve({error:entry.error})

                resolve(entry[hash])
            }else{
                resolve(false)
            }
        })
    }

    createTransactionReceipt(transaction){
        return new Promise( async (resolve)=>{
            let receipt = {
                fromAddress:transaction.fromAddress,
                toAddress:transaction.toAddress,
                amount:transaction.amount,
                miningFee:transaction.miningFee,
                size:jsonSize(transaction)
            }

            resolve(receipt)
        })
    }

    createActionReceipt(action){
        return new Promise( async (resolve)=>{
            let receipt = {
                fromAccount:action.fromAccount,
                type:action.type,
                task:action.task,
                fee:action.fee,
                size:jsonSize(action)
            }

            resolve(receipt)
        })
    }

    gatherTransactionsForBlock(){
        return new Promise( async (resolve)=>{
            let transactions = {}
            let hashes = Object.keys(this.txReceipts)
            for await(var hash of hashes){
                let batchSize = await this.calculateSizeOfBatch(transactions);

                if(batchSize < this.maxBatchSize){
                    let transaction = await this.getTransaction(hash)
                
                    if(transaction){
                        if(transaction.error) resolve({error:transaction.error})
                        transactions[transaction.hash] = transaction
                    }
                    
                }
                
            }

            resolve(transactions)
        })
    }
    gatherActionsForBlock(){
        return new Promise( async (resolve)=>{
            let actions = {}
            let hashes = Object.keys(this.actionReceipts)
            let lastHash = hashes[hashes.length - 1]
            let finished = false

            for await(var hash of hashes){
                let batchSize = await this.calculateSizeOfBatch(actions);

                if(batchSize < this.maxBatchSize){
                    let action = await this.getAction(hash)
                
                    if(action){
                        if(action.error) resolve({error:action.error})
                        actions[action.hash] = action
                    }
                    
                    if(hash == lastHash) finished = true
                }else{
                    if(hash == lastHash) finished = true
                }
                
            }

            if(finished){
                resolve(actions)
            }
        })
    }
    deleteTransactionsFromMinedBlock(transactions){
        return new Promise(async (resolve)=>{
            let hashes = Object.keys(transactions)
           

            for await(var hash of hashes){
                let entry = await this.transactions.get(hash)
                if(entry){
                    if(entry.error) resolve({error:entry.error})

                    let deleted = await this.transactions.delete(entry)
                    if(deleted.error) resolve({error:deleted.error})

                    delete this.txReceipts[hash]

                }
                
            }

            resolve(true)
        })
    }

    deleteActionsFromMinedBlock(actions){
        return new Promise(async (resolve)=>{
            let hashes = Object.keys(actions)
            let lastHash = hashes[hashes.length - 1]
            let finished = false

            for await(var hash of hashes){
                let entry = await this.actions.get(hash)
                if(entry){
                    if(entry.error) resolve({error:entry.error})

                    let deleted = await this.actions.delete(entry)
                    if(deleted.error) resolve({error:deleted.error})

                    delete this.actionReceipts[hash]

                    if(hash == lastHash) finished = true
                }
                
            }

            if(finished){
                resolve(true)
            }
        })
    }
    sizeOfPool(){
        if(Object.keys(this.txReceipts).length > 0){
            let size = Object.keys(this.txReceipts).length
            return size
        }else{
            return 0
        }
        
    }
    sizeOfActionPool(){
        if(Object.keys(this.actionReceipts).length > 0){
            let size = Object.keys(this.actionReceipts).length
            return size
        }else{
            return 0
        }
    }

    calculateSizeOfBatch(batch){
        return new Promise( async (resolve)=>{
            let totalSize = 0;
            let hashes = Object.keys(batch)
            for await(var hash of hashes){
                let size = 0
                if(this.txReceipts[hash]){
                    size = this.txReceipts[hash].size
                }else if(this.actionReceipts[hash]){
                    size = this.actionReceipts[hash].size
                }

                totalSize += size
            }

            resolve(totalSize)
        })
    }
    
    orderTransactionsByTimestamp(transactions){
        return new Promise( async (resolve)=>{
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
        })
    }

    orderTransactionsByMiningFee(transactions){
        return new Promise( async (resolve)=>{
            if(typeof transactions == 'object'){
                let txHashes = Object.keys(transactions);
                let orderedTransaction = {};
                let txAndMiningFee = {};
        
                if(txHashes){
                  txHashes.forEach( hash =>{
                    let transaction = transactions[hash];
                    txAndMiningFee[transaction.miningFee] = hash;
                  })
        
                  let miningFees = Object.keys(txAndMiningFee);
                  miningFees.sort(function(a, b){return a-b});
                  miningFees.forEach( miningFee=>{
                    let hash = txAndMiningFee[miningFee];
                    let transaction = transactions[hash];
                    orderedTransaction[hash] = transaction;
                  })
        
                  return orderedTransaction;
        
                }
        
            }
        })
    }

    rejectTransaction(hash){
        return new Promise(async (resolve)=>{
            let entry = await this.transactions.get(hash)
            if(entry){
                if(entry.error) resolve({error:entry.error})

                let deleted = await this.transactions.delete(entry)

                if(deleted){
                    if(deleted.error) resolve({error:deleted.error})
                    else   resolve(deleted)
                    
                }
            }
        })
    }

    rejectAction(hash){
        return new Promise(async (resolve)=>{
            let entry = await this.actions.get(hash)
            if(entry){
                if(entry.error) resolve({error:entry.error})

                let deleted = await this.actions.delete(entry)

                if(deleted){
                    if(deleted.error) resolve({error:deleted.error})
                    else   resolve(deleted)
                    
                }
            }
        })
    }

    loadMempool(){
        return new Promise(async (resolve)=>{
            let txEntry = await this.transactions.get('receipts')
            let actionEntry = await this.actions.get('receipts')

            if(txEntry.error) resolve({error:this.txReceipts.error})
            if(actionEntry.error) resolve({error:this.actionReceipts.error})

            this.txReceipts = txEntry.receipts || {};
            this.actionReceipts = actionEntry.receipts || {};

            resolve(true)
        })
    }

    saveMempool(){
        return new Promise( async (resolve)=>{
            let savedTxReceipts = await this.transactions.add({
                _id:'receipts',
                'receipts':this.txReceipts
            })

            let savedActionReceipts = await this.actions.add({
                _id:'receipts',
                'receipts':this.actionsReceipts
            })

            if(savedTxReceipts.error) resolve({error:savedTxReceipts.error})
            if(savedActionReceipts.error) resolve({error:savedActionReceipts.error})

            resolve(true)
        })
    }
}

module.exports = Mempool

// const create = async () =>{
//     let Transaction = require('./transaction');
//     let myTx = new Transaction('hello', 'damn', 5);
//     let myTx2 = new Transaction('hello', 'danus', 5);
//     let myTx3 = new Transaction('hello', 'damus', 5);
//     let myPool = new Mempool();
//     let added = await myPool.addTransaction(myTx)
//     let added2 = await myPool.addTransaction(myTx2)
//     let added3 = await myPool.addTransaction(myTx3)
//     if(added && added2 && added3) {
//         let tx = await myPool.gatherTransactionsForBlock()

//         let deleted = await myPool.deleteTransactionsFromMinedBlock({ 
//             transactions:tx,
//             hash:'oaijwdoaiwjdoawdjaowidj'
//          })

//          console.log(deleted)
//     }
    
// }

// create()