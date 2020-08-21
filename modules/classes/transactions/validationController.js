const { Worker } = require('worker_threads');
const { logger } = require('../../tools/utils')
const chalk = require('chalk')
const EventEmitter = require('events')

class ValidationController{
    constructor({ balanceTable, accountTable, contractTable, spentTransactions, spentActions }){
        this.balanceTable = balanceTable
        this.accountTable = accountTable
        this.contractTable = contractTable
        this.spentTransactions = spentTransactions
        this.spentActions = spentActions
        this.worker = {}
        this.resultEvents = new EventEmitter()
    }

    async startThread(){
        
        this.worker = new Worker(__dirname+'/validationWorker.js', {
            workerData: {
                balances:await this.balanceTable.getCurrentBalances(),
                accounts:await this.accountTable.getAllAccounts(),
                contracts:await this.contractTable.getAllContracts()
            }
        });

        logger('Validation Worker thread started')

        this.balanceTable.balanceEvents.on('newState', (balances)=>{
            this.worker.postMessage({ balances:balances })
        })

        this.accountTable.accountEvents.on('newAccount', account => this.worker.postMessage({ newAccount:account }))
        this.accountTable.accountEvents.on('deleteAccount', accountName => this.worker.postMessage({ deleteAccount:accountName }))
        
        this.contractTable.contractEvents.on('newContract', contract => this.worker.postMessage({ newContract:contract }))
        this.contractTable.contractEvents.on('deleteContract', contractName => this.worker.postMessage({ deleteContract:contractName }))

        this.worker.on('error', async (error)=>{
            logger(chalk.red('VALIDATION CONTROL ERROR'), error)
            this.worker.terminate()
            await this.startThread()
        })

        this.worker.on('message', (message)=>{
            if(message.validatedTransaction){
                let transaction = message.validatedTransaction.transaction
                let result = message.validatedTransaction.result
                if(this.spentTransactions[transaction.hash]){
                    this.resultEvents.emit(transaction.hash, {  
                            result: { error:`ERROR: Transaction ${transaction.hash.substr(0, 15)}... is already spent` }, 
                            transaction:transaction 
                    })
                }else{
                    this.resultEvents.emit(transaction.hash, { result:result, transaction:transaction })
                }
                
            }else if(message.validatedAction){
                let action = message.validatedAction.action
                let result = message.validatedAction.result
                if(this.spentActions[action.hash]){
                    this.resultEvents.emit(action.hash, {  
                            result: { error:`ERROR: Transaction ${action.hash.substr(0, 15)}... is already spent` }, 
                            action:action 
                    })
                }else{
                    this.resultEvents.emit(action.hash, { result:result, action:action })
                }
                
            }
        })
    
    }

    validateTransaction(transaction){
        return new Promise((resolve)=>{
            this.resultEvents.once(transaction.hash, ({ result, transaction })=>{
                if(result.error) resolve({ error:result.error })
                else resolve({ result:result, transaction:transaction })
            })
            this.worker.postMessage({ validateTransaction:transaction })
            
        })
    }

    validateAction(action){
        return new Promise((resolve)=>{
            
            this.resultEvents.once(action.hash, ({ result, action })=>{
                if(result.error) resolve({ error:result.error })
                else resolve({ result:result, action:action })
            })
            this.worker.postMessage({ validateAction:action })
            
        })
    }



}


module.exports = ValidationController