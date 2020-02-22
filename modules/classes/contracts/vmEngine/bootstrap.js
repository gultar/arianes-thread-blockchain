const EventEmitter = require('events')
const { Worker } = require('worker_threads')
const bootstrapLog = require('debug')('bootstrap')

let { accountTable } = require('../../instances')

class Bootstrap{
    constructor({ 
        contractConnector, 
        deferContractAction, 
        deferPayable, 
        emitContractAction, 
        emitPayable, 
        getCurrentBlock, 
        getBalance, }){
        this.getBalance = getBalance
        this.contractConnector = contractConnector
        this.deferContractAction = deferContractAction
        this.deferPayable = deferPayable
        this.emitContractAction = emitContractAction
        this.emitPayable = emitPayable
        this.getCurrentBlock = getCurrentBlock
        this.events = new EventEmitter()
        this.workers = {}
        this.workerMemory = {}
        this.calls = {}
        this.timers = {}
        this.workerLifetime = 1000
    }

    startVM(){
        this.events.on('run', async (code)=>{
            bootstrapLog('Received a call to execute', code.hash)
            let worker = await this.getWorker(code.contractName)
            bootstrapLog('Loaded worker for', code.contractName)
            worker.postMessage({run:code, hash:code.hash, contractName:code.contractName})
            this.calls[code.hash] = code
        })
        return this.events
    }

    createVMTimer(contractName){
        bootstrapLog('Timer created for ', contractName)
        this.timers[contractName] = setTimeout(async ()=>{
            bootstrapLog('Timer kicked in, killing VM ', contractName)
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
        try{
            let worker = await this.getWorker(contractName)
            worker.terminate()
            this.stopVMTimer(contractName)
            delete this.workers[contractName]
            return true
        }catch(e){
            return {error:e.message}
        }
    }

    restartVM(){}

    async addContract(contractName){
        let contractCode = await this.contractConnector.getContractCode(contractName)
        bootstrapLog('Contract code loaded', (contractCode?true:false))
        if(contractCode){
            
            let worker = await this.getWorker(contractName)
            worker.postMessage({contractName:contractName, contractCode:contractCode})
            bootstrapLog('Sent contract code to worker')
            this.workerMemory[contractName] = {
                contract:contractCode,
                state: {}
            }
            bootstrapLog('Contract code for '+ contractName +' stored in worker memory')
            

            return { sent: true }
        }else{
            return { error:'ERROR: Could not get contract code of '+contractName }
        }
    }

    async setContractState(contractName, state){
        if(contractName && state){
            let worker = await this.getWorker(contractName)
            worker.postMessage({setState:state, contractName:contractName})
            bootstrapLog('State of '+contractName+' sent to worker and added to its memory')
            let memory = this.workerMemory[contractName]
            memory.state = state

            return true
        }else{
            return { error:'ERROR: Must provide valid contract name and state to setup vm statestorage'}
        }
    }

    buildVM({ contractName, workerData }){
        return new Promise(async (resolve)=>{
            
            let worker = new Worker('./modules/classes/contracts/vmEngine/worker.js', {
                workerData: workerData,
                ressourceLimits:{
                    maxOldGenerationSizeMb:128
                }
           })

           bootstrapLog('Build VM worker', (worker?true:false))
           
           this.workers[contractName] = worker

           if(this.workerMemory[contractName] && Object.keys(this.workerMemory[contractName]).length > 0){
                worker.postMessage({ contractName:contractName, contractCode:this.workerMemory[contractName].contract })
                bootstrapLog('Sending contract code of '+contractName+' stored in memory to worker')
                if(this.workerMemory[contractName].state && Object.keys(this.workerMemory[contractName].state) > 0) {
                    bootstrapLog('Sending contract state of '+contractName+' code stored in memory to worker')
                    worker.postMessage({ contractName:contractName, setState:this.workerMemory[contractName].state })
                }
           }

           worker.on('error', err => {
               bootstrapLog('Received a worker error', err)
               this.events.emit(err.hash, {
                   error:err.message,
                   contractName:err.contractName,
                   hash:err.hash
               })
           })
           worker.on('exit', ()=>{ })
           worker.on('message', async (message)=>{
                // let rewinded = await this.rewindVMTimer(contractName)
               
                if(message.singleResult){
                    
                    
                    let result = JSON.parse(message.singleResult)
                    
                    delete this.calls[result.hash]
                    if(result.error){
                        //VM Returned an error
                        
                        bootstrapLog('Result error received', result.error)
                        this.events.emit(result.hash, {
                            error:result.error,
                            contractName:result.contractName,
                            hash:result.hash
                        })
                    }else{
                        bootstrapLog('Single result received', result)
                        this.events.emit(result.hash, {
                            value:result.value,
                            contractName:result.contractName,
                            state:result.state,
                            hash:result.hash
                        })
                    }
                    
                }else if(message.getState){

                    
                    let state = await this.contractConnector.getState(message.getState);
                    let contractName = message.getState

                    bootstrapLog('Worker requested contract state for', contractName)
                    if(state && Object.keys(state).length > 0){

                        if(state.error) worker.postMessage({error:state.error})
                        else{
                            worker.postMessage({ state:state })
                        }
                    }else{
                        worker.postMessage({error:'Could not find state of '+message.getState})
                    }

                }else if(message.getContract){
                    let contract = await this.contractConnector.getContractCode(message.getContract);
                    bootstrapLog('Worker requested contract code for', contractName)
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
                    let account = await accountTable.getAccount(name);
                    bootstrapLog('VM requested account', name)
                    // let worker = await this.getWorker(contractName)

                    if(account && Object.keys(account).length > 0){
                        if(account.error) worker.postMessage({error:account.error})
                        else{
                            worker.postMessage({ account:account })
                        }
                    }else{
                        worker.postMessage({ account:{} })
                    }

                }else if(message.getBalance){

                    let name = message.getBalance
                    let balance = await this.getBalance(name);
                    bootstrapLog('VM requested balance of account', name, '- balance:', balance)

                    if(balance.error) worker.postMessage({error:balance.error})
                    else worker.postMessage({ balance:balance })

                }else if(message.getCurrentBlock){
                    let currentBlock = await this.getCurrentBlock()
                    worker.postMessage({ currentBlock:currentBlock })
                }else if(message.deferContractAction){
                    
                    let contractAction = JSON.parse(message.deferContractAction)
                    if(contractAction){
                        let deferred = await this.deferContractAction(contractAction);
                        bootstrapLog('Deferred contract action', deferred)
                        if(deferred){
                            if(deferred.error) worker.postMessage({error:deferred.error})
                            else{
                                worker.postMessage({ deferred:deferred })
                            }
                        }else{
                            worker.postMessage(false)
                        }
                    }

                }else if(message.deferPayable){
                    
                    let payable = JSON.parse(message.deferPayable)
                    if(payable){
                        let deferred = await this.deferPayable(payable);
                        bootstrapLog('Deferred payable', deferred)
                        if(deferred){
                            if(deferred.error) worker.postMessage({error:deferred.error})
                            else{
                                worker.postMessage({ deferred:deferred })
                            }
                        }else{
                            worker.postMessage(false)
                        }
                    }

                }else if(message.emitContractAction){
                    
                    let contractAction = JSON.parse(message.emitContractAction)
                    if(contractAction){
                        let emitted = await this.emitContractAction(contractAction);
                        bootstrapLog('Emitted contract action', emitted)
                        if(emitted){
                            if(emitted.error) worker.postMessage({error:emitted.error})
                            else{
                                worker.postMessage({ emitted:emitted })
                            }
                        }else{
                            worker.postMessage(false)
                        }
                    }
                    
                }else if(message.emitPayable){
                    
                    let payable = JSON.parse(message.emitPayable)
                    if(payable){
                        let emitted = await this.emitPayable(payable);
                        bootstrapLog('Emitted payable', emitted)
                        if(emitted){
                            if(emitted.error) worker.postMessage({error:emitted.error})
                            else{
                                worker.postMessage({ emitted:emitted })
                            }
                        }else{
                            worker.postMessage(false)
                        }
                    }
                    
                }else if(message.error){

                    // console.log('VM ERROR:',message)
                    bootstrapLog('VM Error', message)
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
            this.workers[contractName] = await this.buildVM({ contractName:contractName, workerData:this.workerMemory[contractName] || {} })
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