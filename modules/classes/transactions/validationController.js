const { Worker } = require('worker_threads');


class ValidationController{
    constructor({ balanceTable, accountTable, contractTable }){
        this.balanceTable = balanceTable
        this.accountTable = accountTable
        this.contractTable = contractTable
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

          let call = {
            fromAddress: 'john',
            toAddress: 'Tokens',
            type: 'call',
            data: {
              method: 'transfer',
              cpuTime: 5,
              params: { symbol: 'GOLD', receiver: 'mary', amount: 1 }
            },
            timestamp: 1597921504368,
            amount: 0,
            nonce: 0,
            hash: '23649e0ae0952f4d6306dfd78ca4ede167ae3b0d5060b3f3d425d23e5d762fca',
            miningFee: 0.018000000000000002,
            delayToBlock: 0,
            signature: 'qtVYe/rtrnzng1FAcKgPoAarDfLoOWn9TA60LHd1eM+mUCPfeKFxUOL1DDC86lSE3kAGBYgE+pq2X7X/s1S1KQ=='
          }
          
          
          
        const worker = new Worker(__dirname+'/validationWorker.js', {
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

        // for(var i=0; i < 100; i++){
        //     worker.postMessage({ test:tx })
        // }

        worker.postMessage({ test:call })
    
    }



}


module.exports = ValidationController