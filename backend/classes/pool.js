// const Database = require('./database')
const Database = require('./db')
const jsonSize = require('json-size');
const EventEmitter = require('events')
const { logger } = require('../tools/utils')


class Mempool{
    constructor(){
        this.transactions = new Database('transactionsPool')
        this.actions = new Database('actionsPool')
        this.deferredTransactions = new Database('deferredTransactionsPool')
        this.deferredActions = new Database('deferredActionsPool')
        this.txReceipts = {}
        this.delayedTransactions = {}
        this.delayedActions = {}
        this.actionReceipts = {}
        this.usedTxReceipts = {}
        this.usedActionReceipts = {}
        this.maxBatchSize = 10000 * 10000;
        this.busyGathering = false
        this.events = new EventEmitter()
    }

    async manageDeferredTransactions(latestBlock){
        if(latestBlock && latestBlock.blockNumber){
            let numTransactionAdded = 0
            for await(let hash of Object.keys(this.delayedTransactions)){
                let transaction = this.delayedTransactions[hash]
                if(transaction.delayToBlock <= latestBlock.blockNumber){
                    delete transaction.delayToBlock
                    let added = await this.addTransaction(transaction)
                    if(added.error) return { error: { delayedTransactionError:added.error } }

                    numTransactionAdded++
                }
            }

            return { delayedTransactionsAdded:numTransactionAdded };
        }else{
            return { error:'DELAYED TX ERROR: Need to provide valid latest block' }
        }
        
    }

    async manageDeferredActions(latestBlock){
        if(latestBlock && latestBlock.blockNumber){
            let numActionAdded = 0
            for await(let hash of Object.keys(this.delayedActions)){
                let action = this.delayedActions[hash]
                if(action.delayToBlock <= latestBlock.blockNumber){
                    delete action.delayToBlock
                    let added = await this.addAction(action)
                    if(added.error) return { error: { delayedActionError:added.error } }

                    numActionAdded++
                }
            }

            return { delayedTransactionsAdded:numActionAdded };
        }else{
            return { error:'DELAYED ACTION ERROR: Need to provide valid latest block' }
        }
        
    }

    deferTransaction(transaction){
        if(transaction && transaction.delayToBlock){

            this.delayedActions[transaction.hash] = transaction

            return true
        }else{
            return false
        }
    }

    deferAction(action){
        if(action && action.delayToBlock){

            this.delayedActions[action.hash] = action

            return true
        }else{
            return false
        }
    }

    deferContractAction(action){
        if(action && action.delayToBlock){
            //Add extra validation
            this.delayedActions[action.hash] = action

            return true
        }else{
            return false
        }
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
                this.events.emit('newTransaction', transaction)
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
                this.events.emit('newAction', action)
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

    useTransaction(hash){
        return new Promise((resolve)=>{
            let receipt = this.txReceipts[hash]
            if(receipt){
                this.usedTxReceipts[hash] = JSON.parse(JSON.stringify(receipt))
                delete this.txReceipts[hash]
                resolve(true)
            }else{
                resolve({error:`Could not use transaction of hash ${hash}`})
            }
        })
    }

    removeTransaction(hash){
        return new Promise(async(resolve)=>{
            
            let deleted = await this.transactions.delete({_id:hash})
            resolve(deleted)
        })
    }

    removeAction(hash){
        return new Promise(async (resolve)=>{
            let deleted = await this.actions.delete({_id:hash})
            resolve(deleted)
        })
    }

    unuseTransaction(hash){
        return new Promise((resolve)=>{
            let receipt = this.usedTxReceipts[hash]
            if(receipt){
                this.txReceipts[hash] = JSON.parse(JSON.stringify(receipt))
                delete this.usedTxReceipts[hash]
                resolve(true)
            }else{
                resolve({error:`Could not unuse transaction of hash ${hash}`})
            }
        })
    }

    useAction(hash){
        return new Promise((resolve)=>{
            let receipt = this.actionReceipts[hash]
            if(receipt){
                this.usedActionReceipts[hash] = JSON.parse(JSON.stringify(receipt))
                delete this.actionReceipts[hash]
                resolve(true)
            }else{
                resolve({error:`Could not use action of hash ${hash}`})
            }
        })
    }

    unuseAction(hash){
        return new Promise((resolve)=>{
            let receipt = this.usedActionReceipts[hash]
            if(receipt){
                this.actionReceipts[hash] = JSON.parse(JSON.stringify(receipt))
                delete this.usedActionReceipts[hash]
                resolve(true)
            }else{
                resolve({error:`Could not unuse action of hash ${hash}`})
            }
        })
    }

    gatherTransactionsForBlock(){
        return new Promise( async (resolve)=>{
            
            let transactions = {}
            let hashes = Object.keys(this.txReceipts)
            let errors = {}
            let batchSize = 0
            
            for await(var hash of hashes){
                batchSize += jsonSize(transactions)
                
                if(batchSize < this.maxBatchSize){
                    let transaction = await this.getTransaction(hash)
                    
                    if(transaction){
                        if(transaction.error) errors[hash] = transaction.error
                        
                        let used = await this.removeTransaction(hash)
                        if(used && !used.error) transactions[transaction.hash] = transaction
                    }
                    
                }else{
                    
                    resolve(transactions)
                    break;
                }
                
            }

            resolve(transactions)
        })
    }

    putbackTransactions(block){
        return new Promise(async (resolve)=>{
            let txHashes = Object.keys(block.transactions);
            let errors = {}
            for await(let hash of txHashes){
                let transaction = block.transactions[hash]
                
                if(transaction.fromAddress !== 'coinbase'){
                    let putback = await this.addTransaction(transaction)
                    if(putback.error) errors[hash] = putback.error
                }
                
            }

            if(Object.keys(errors).length > 0) resolve({error:errors})
            else resolve(true)
        })
    }
    gatherActionsForBlock(){
        return new Promise( async (resolve)=>{
            let actions = {}
            let hashes = Object.keys(this.actionReceipts)
            // console.log('Action Receipts:', this.actionReceipts)
            let errors = {}
            let batchSize
            for await(var hash of hashes){
                batchSize = jsonSize(actions);

                if(batchSize < this.maxBatchSize){
                    let action = await this.getAction(hash)
                    if(action){
                        if(action.error) errors[hash] = action.error
                        
                        let used = await this.removeAction(hash)
                        if(used){
                            if(used.error) errors[hash] = used.error
                            actions[action.hash] = action
                        }
                        
                    }
                    
                }else{
                    
                    resolve(actions)
                    break;
                }
                
            }

            if(Object.keys(errors).length > 0) resolve({error:errors})
            else resolve(actions)
        })
    }
    putbackActions(block){
        return new Promise(async (resolve)=>{
            let actionHashes = Object.keys(block.actions);
            let errors = {}
            for await(let hash of actionHashes){
                let action = block.actions[hash]
                let putback = await this.addAction(action)
                if(putback.error) errors[hash] = putback.error
            }

            if(Object.keys(errors).length > 0) resolve({error:errors})
            else resolve(true)
        })
    }
    deleteTransactionsFromMinedBlock(transactions){
        return new Promise(async (resolve)=>{
            let hashes = Object.keys(transactions)
            let errors = {}

            for(var hash of hashes){
                let entry = await this.transactions.get(hash)
                if(entry){
                    if(entry.error) errors[hash] = entry.error

                    delete this.usedTxReceipts[hash]
                    delete this.txReceipts[hash]
                    let deleted = await this.transactions.delete(entry)
                    if(deleted){
                        if(deleted.error) errors[hash] = deleted.error 
                    }
                    
                }else{
                    // console.log('Could not find transaction '+hash+" to delete")
                }
                
            }

            if(Object.keys(errors) > 0){
                resolve({error:errors})
            }else{
                resolve(true)
            }

        })
    }

    deleteTransactionsOfBlock(transactions){
        return new Promise(async (resolve)=>{
            let hashes = Object.keys(transactions)
            let errors = {}

            for(var hash of hashes){
                delete this.usedTxReceipts[hash]
                delete this.txReceipts[hash]
                let deleted = await this.transactions.delete({_id:hash})
                if(deleted){
                    if(deleted.error) errors[hash] = deleted.error 
                }
                
            }

            if(Object.keys(errors) > 0){
                resolve({error:errors})
            }else{
                resolve(true)
            }

        })
    }

    deleteActionsFromMinedBlock(actions){
        return new Promise(async (resolve)=>{
            let hashes = Object.keys(actions)
            let errors = {}


            for await(var hash of hashes){
                let entry = await this.actions.get(hash)
                if(entry){
                    if(entry.error) resolve({error:entry.error})

                    delete this.actionReceipts[hash]
                    let deleted = await this.actions.delete(entry)
                    if(deleted){
                        if(deleted.error) errors[hash] = deleted.error 
                    }
                    

                }
                
            }

            if(Object.keys(errors) > 0){
                resolve({error:errors})
            }else{
                resolve(true)
            }
        })
    }

    deleteActionsOfBlock(actions){
        return new Promise(async (resolve)=>{
            let hashes = Object.keys(actions)
            let errors = {}

            for(var hash of hashes){
                delete this.usedActionReceipts[hash]
                delete this.actionReceipts[hash]
                let deleted = await this.actions.delete({_id:hash})
                if(deleted){
                    if(deleted.error) errors[hash] = deleted.error 
                }
                
            }

            if(Object.keys(errors) > 0){
                resolve({error:errors})
            }else{
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
                
                if(this.txReceipts[hash]){
                    totalSize += jsonSize(this.txReceipts[hash])
                }else if(this.actionReceipts[hash]){
                    totalSize += jsonSize(this.actionReceipts[hash])
                }
                
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
            let txEntry = await this.transactions.getAll()
            let actionEntry = await this.actions.getAll()
            
            if(txEntry && txEntry.length){
                for await(let index of txEntry){
                    
                    let hash = index._id
                    this.txReceipts[hash] = index[hash]
                    // console.log(txEntry)
                    // let tx = txEntry[index]
                    // this.txReceipts[tx.hash] = tx
                }
            }
            if(actionEntry && actionEntry.length){
                for await(let index of actionEntry){
                    let hash = index._id
                    this.actionReceipts[hash] = index[hash]
                    // let action = actionEntry[index]
                    // this.actionReceipts[action.hash] = action
                }
            }

            resolve({ loadedTxReceipts:this.txReceipts, loadedActionsReceipts:this.actionReceipts })
        })
    }

    saveMempool(){
        return new Promise( async (resolve)=>{
            // // let savedTxReceipts = await this.transactions.add({
            // //     _id:'receipts',
            // //     'receipts':this.txReceipts
            // // })

            // // let savedActionReceipts = await this.actions.add({
            // //     _id:'receipts',
            // //     'receipts':this.actionsReceipts
            // // })

            // if(savedTxReceipts.error) resolve({error:savedTxReceipts.error})
            // if(savedActionReceipts.error) resolve({error:savedActionReceipts.error})

            resolve(true)
        })
    }
}

module.exports = Mempool
