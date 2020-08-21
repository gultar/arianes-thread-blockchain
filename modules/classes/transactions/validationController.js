const { Worker } = require('worker_threads');


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
            this.worker.postMessage({ validate:transaction })
            
        })
    }



}


module.exports = ValidationController