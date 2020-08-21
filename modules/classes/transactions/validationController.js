const { Worker } = require('worker_threads');
const { logger } = require('../../tools/utils')
const chalk = require('chalk')

class ValidationController{
    constructor({ balanceTable, accountTable, contractTable }){
        this.balanceTable = balanceTable
        this.accountTable = accountTable
        this.contractTable = contractTable
        this.worker = {}
    }

    async startThread(){
        this.worker = new Worker(__dirname+'/validationWorker.js', {
            workerData: {
                balances:await this.balanceTable.getCurrentBalances(),
                accounts:await this.accountTable.getAllAccounts(),
                contracts:await this.contractTable.getAllContracts()
            }
        });

        this.worker.on('error', (error)=>{
            logger(chalk.red('VALIDATION CONTROL ERROR'), error)
            this.worker.terminate()
            //this.startThread()
        })
    
    }

    validateTransaction(transaction){
        return new Promise((resolve)=>{
            const receiveResult = (message)=>{
                if(message[transaction.hash]){
                    let result = message[transaction.hash]
                    if(result.error) resolve({ error:result.error })
                    else resolve(message.transaction)
                }
            }
            this.worker.once('message', receiveResult)
            this.worker.postMessage({ validateTransaction:transaction })
            
        })
    }

    validateAction(action){
        return new Promise((resolve)=>{
            const receiveResult = (message)=>{
                if(message[action.hash]){
                    let result = message[action.hash]
                    if(result.error) resolve({ error:result.error })
                    else resolve(message.action)
                }
            }
            this.worker.once('message', receiveResult)
            this.worker.postMessage({ validateAction:action })
            
        })
    }



}


module.exports = ValidationController