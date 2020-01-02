const EventEmitter = require('events')
const { Worker } = require('worker_threads')
class Bootstrap{
    constructor({ contractConnector, accountTable, buildCode, deferContractAction, getCurrentBlock }){
        this.contractConnector = contractConnector
        this.accountTable = accountTable
        this.buildCode = buildCode
        this.deferContractAction = deferContractAction
        this.getCurrentBlock = getCurrentBlock
        this.events = new EventEmitter()
        this.workers = {}
        this.calls = {}
        this.timers = {}
        this.workerLifetime = 1000
    }

    startVM(){
        this.events.on('run', async (code)=>{
            let worker = await this.getWorker(code.contractName)
            worker.postMessage({run:code, hash:code.hash, contractName:code.contractName})
            
            this.calls[code.hash] = code
        })

        return this.events
    }

    createVMTimer(contractName){
        this.timers[contractName] = setTimeout(async ()=>{
            let terminated = await this.terminateVM(contractName)
        }, this.workerLifetime)
        return true
    }

    rewindVMTimer(contractName){
        let timer = this.timers[contractName]
        if(timer){
            clearTimeout(timer)
            let created = this.createVMTimer(contractName)
            return created
        }else{
            return false
        }
    }

    stopVMTimer(contractName){
        let timer = this.timers[contractName]
        if(timer){
            clearTimeout(timer)
            return true
        }else{
            return false
        }
    }

    stop(){}

    async terminateVM(contractName){
        let worker = await this.getWorker(contractName)
        worker.terminate()
        this.stopVMTimer(contractName)
        delete this.workers[contractName]
    }

    restartVM(){}

    async addContract(contractName){
        let contractCode = await this.contractConnector.getContractCode(contractName)
        if(contractCode){
            
            let worker = await this.getWorker(contractName)
            worker.postMessage({contractName:contractName, contractCode:contractCode})
            return { sent: true }
        }else{
            return { error:'ERROR: Could not get contract code of '+contractName }
        }
    }

    async setContractState(contractName, state){
        if(contractName && state){
            let worker = await this.getWorker(contractName)
            worker.postMessage({setState:state, contractName:contractName})
            return true
        }else{
            return { error:'ERROR: Must provide valid contract name and state to setup vm statestorage'}
        }
    }

    buildVM({ contractName, workerData }){
        return new Promise(async (resolve)=>{
            
            let worker = new Worker('./backend/contracts/vmEngine/worker.js', {
                workerData: workerData,
                ressourceLimits:{
                    maxOldGenerationSizeMb:128
                }
           })
        //    let timerStarted = this.createVMTimer(contractName)
           this.workers[contractName] = worker
           worker.on('error', err => console.log('Bootstrap',err))
           worker.on('exit', ()=>{ })
           worker.on('message', async (message)=>{
                // let rewinded = await this.rewindVMTimer(contractName)
                
                if(message.singleResult){
                    
                    let result = JSON.parse(message.singleResult)
                    
                    delete this.calls[result.hash]
                    if(result.error){
                        //VM Returned an error
                        
                        this.events.emit(result.hash, {
                            error:result.error,
                            contractName:result.contractName,
                            hash:result.hash
                        })
                    }else{
                        
                        this.events.emit(result.hash, {
                            value:result.value,
                            contractName:result.contractName,
                            state:result.state,
                            hash:result.hash
                        })
                    }
                    
                }else if(message.getState){

                    console.log('VM Request state because its loaded state is empty')
                    let state = await this.contractConnector.getState(message.getState);
                    let contractName = message.getState
                    let worker = await this.getWorker(contractName)
                    
                    if(state && Object.keys(state).length > 0){

                        if(state.error) worker.postMessage({error:state.error})
                        else{
                            worker.postMessage({ state:state })
                        }
                    }else{
                        worker.postMessage({error:'Could not find state of '+message.getState})
                    }

                }else if(message.getContract){

                    console.log('Requested a contract', message.getContract)
                    let contract = await this.contractConnector.getContractCode(message.getContract);
                    let contractName = message.getContract
                    let worker = await this.getWorker(contractName)

                    if(contract && Object.keys(contract).length > 0){
                        if(contract.error) worker.postMessage({error:contract.error})
                        else{
                            worker.postMessage({ contract:contract })
                        }
                    }else{
                        worker.postMessage({ contract:{} })
                    }

                }else if(message.getAccount){

                    let { name, contractName } = message.getAccount
                    let account = await this.accountTable.getAccount(name);

                    let worker = await this.getWorker(contractName)

                    if(account && Object.keys(account).length > 0){
                        if(account.error) worker.postMessage({error:account.error})
                        else{
                            worker.postMessage({ account:account })
                        }
                    }else{
                        worker.postMessage({ account:{} })
                    }

                }else if(message.getCurrentBlock){
                    let currentBlock = await this.getCurrentBlock()
                    worker.postMessage({ currentBlock:currentBlock })
                }else if(message.defer){
                    
                    let contractAction = JSON.parse(message.defer)
                    if(contractAction){
                        let deferred = await this.deferContractAction(contractAction);
                        if(deferred){
                            if(deferred.error) worker.postMessage({error:deferred.error})
                            else{
                                worker.postMessage({ deferred:deferred })
                            }
                        }else{
                            worker.postMessage(false)
                        }
                    }
                    // let account = await this.accountTable.getAccount(name);

                    

                }else if(message.error){

                    console.log('VM ERROR:',message)
                    this.events.emit(message.hash, {
                        error:message.error,
                        contractName:message.contractName
                    })

                }
            
           })

           resolve(worker)
        })
    }

    async getWorker(contractName){
        if(this.workers[contractName]){
            return this.workers[contractName]
        }else{
            this.workers[contractName] = await this.buildVM({ contractName:contractName, workerData:{} })
            return this.workers[contractName];
        }
    }

    destroyVM(contractName){
        if(this.workers[contractName]){
            delete this.workers[contractName]
        }

        return true
        
    }
    



    
}

module.exports = Bootstrap