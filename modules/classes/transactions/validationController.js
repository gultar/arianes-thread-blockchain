const { Worker } = require('worker_threads');


class ValidationController{
    constructor({ balanceTable, accountTable }){
        this.balanceTable = balanceTable
        this.accountTable = accountTable
        this.threads = {}
    }

    async startThread(){
        let tx = {
            "fromAddress": "john",
            "toAddress": "mary",
            "type": "",
            "data": "",
            "timestamp": 1597974440076,
            "amount": 1,
            "nonce": 0,
            "hash": "bd9a97b28fc4230b42741c9435b4c21d099a45d18cb5f496337e2c3089bc4132",
            "miningFee": 0.008700000000000001,
            "delayToBlock": 0,
            "signature": "/TemHcMcfc3Cb+DpdE4K0EeYS/zzzYCIJmYz9pY/WfME2yHmfLweNRs8T0thtk8I0HYTCfXErj2tkJcJZ5B9OA=="
          }
          
          
        const worker = new Worker(__dirname+'validationWorker.js', {
            workerData: {
                balanceStates:await this.balanceTable.getCurrentBalances(),
                accounts:await this.accountTable.getAllAccounts()
            }
        });

        worker.on('message', (message)=>{
            if(message.validated){
                console.log('Validation result:', message.validated)
            }
            else if(message.getBalance){}
            else{}
        })

        worker.postMessage({ test:tx })
    }



}


module.exports = ValidationController