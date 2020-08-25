const EventEmitter = require('events')
const { Worker, workerData } = require('worker_threads')
let blockExecutionDebug = require('debug')('blockExecution')
let start = false
let end = false
let callLog = {}
class Bootstrap{
    constructor({ 
        contractConnector, 
        accountTable, 
        buildCode, 
        deferContractAction, 
        deferPayable, 
        emitContractAction, 
        emitPayable, 
        getCurrentBlock, 
        getBalance, }){
        this.getBalance = getBalance
        this.contractConnector = contractConnector
        this.accountTable = accountTable
        this.buildCode = buildCode
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
        this.workerSizeMb = 8
    }

    startVM(){
        this.events.on('runCalls', async (codes)=>{
            for await(let hash of Object.keys(codes)){
                let code = codes[hash]
                this.calls[hash] = code
                callLog[code.hash] = process.hrtime()
            }
            
            let worker = await this.getWorker(codes.contractName)
            worker.postMessage({runCalls:codes, contractName:codes.contractName})
        })
        this.events.on('run', async (code)=>{
            callLog[code.hash] = process.hrtime()
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
        try{
            let worker = await this.getWorker(contractName)
            worker.terminate()
            this.stopVMTimer(contractName)
            let memory = this.workerMemory[contractName]
            memory.state = await this.contractConnector.getLatestState(contractName)
            delete this.workers[contractName]
            return true
        }catch(e){
            return {error:e.message}
        }
    }

    restartVM(){}

    async initContract(contractName){
        
        let memory = this.workerMemory[contractName]
        if(!memory){
            let contractCode = await this.contractConnector.getContractCode(contractName)
            let state = await this.contractConnector.getState(contractName)
            if(state && Object.keys(state).length > 0){
                this.workerMemory[contractName] = {
                    contract:contractCode,
                    state: state
                }

                memory = this.workerMemory[contractName]
            }else {
                throw new Error('ERROR: Could not get state of contract', contractName)
            }
        }

        let worker = await this.getWorker(contractName)
        worker.postMessage({ 
            initContract:{
                contract:memory.contract, state:memory.state, contractName:contractName,
            } 
        })
        return { sent: true }
        
    }

    // async setContract(contractName, contractCode, state){
    //     this.workerMemory[contractName] = {
    //         contract:contractCode,
    //         state: state
    //     }
        
    //     let worker = await this.getWorker(contractName)
        
    //     worker.postMessage({ setContract:contractCode, contractName:contractName, setContractState:state })
        

    //     return { sent: true }
    // }

    // async addContract(contractName){
    //     let contractCode = await this.contractConnector.getContractCode(contractName)
    //     if(contractCode){
            
    //         let worker = await this.getWorker(contractName)
    //         worker.postMessage({contractName:contractName, contractCode:contractCode})
            
    //         this.workerMemory[contractName] = {
    //             contract:contractCode,
    //             state: {}
    //         }
            

    //         return { sent: true }
    //     }else{
    //         return { error:'ERROR: Could not get contract code of '+contractName }
    //     }
    // }

    // async setContractState(contractName, state){
    //     if(contractName && state){
    //         let worker = await this.getWorker(contractName)
    //         worker.postMessage({setState:state, contractName:contractName})

    //         let memory = this.workerMemory[contractName]
    //         memory.state = state

    //         return true
    //     }else{
    //         return { error:'ERROR: Must provide valid contract name and state to setup vm statestorage'}
    //     }
    // }

    buildVM({ contractName}){
        return new Promise(async (resolve)=>{

            
            let worker = new Worker('./modules/classes/contracts/vmEngine/worker.js', {
                workerData: {},
                ressourceLimits:{
                    maxOldGenerationSizeMb:this.workerSizeMb
                }
           })
           
           this.workers[contractName] = worker

           worker.on('exit', ()=>{ })
           worker.on('error', err => {
            console.log('Bootstrap Error',err)
            this.terminateVM(contractName)
            resolve({error:err.message})
           })
           
           worker.on('message', async (message)=>{
                
                if(message.singleResult){
                    
                    let result = JSON.parse(message.singleResult)
                    let endOfExec = process.hrtime(callLog[result.hash])
                    blockExecutionDebug(`${result.hash.substr(0, 15)}... execution: ${endOfExec[1]/1000000}`)
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
                    
                }else if(message.result){
                    
                    let result = JSON.parse(message.singleResult)
                    let endOfExec = process.hrtime(callLog[result.hash])
                    blockExecutionDebug(`${result.hash.substr(0, 15)}... execution: ${endOfExec[1]/1000000}`)
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
                        else worker.postMessage({ state:state })
                    }else worker.postMessage({error:'Could not find state of '+message.getState})

                }else if(message.getContract){

                    console.log('Getting contract from bootstrap')
                    let contract = await this.contractConnector.getContractCode(message.getContract);
                    if(contract && Object.keys(contract).length > 0){
                        if(contract.error) worker.postMessage({error:contract.error})
                        else worker.postMessage({ contract:contract })
                    }else worker.postMessage({ contract:{} })

                }else if(message.getAccount){

                    let { name, contractName } = message.getAccount
                    let account = await this.accountTable.getAccount(name);
                    if(account && Object.keys(account).length > 0){
                        if(account.error) worker.postMessage({error:account.error})
                        else worker.postMessage({ account:account })
                    }else worker.postMessage({ account:{} })

                }else if(message.getBalance){

                    let name = message.getBalance
                    let balance = await this.getBalance(name);
                    if(balance.error) worker.postMessage({error:balance.error})
                    else worker.postMessage({ balance:balance })

                }else if(message.getCurrentBlock){

                    let currentBlock = await this.getCurrentBlock()
                    worker.postMessage({ currentBlock:currentBlock })

                }else if(message.deferContractAction){
                    
                    let contractAction = JSON.parse(message.deferContractAction)
                    if(contractAction){
                        let deferred = await this.deferContractAction(contractAction);
                        if(deferred){
                            if(deferred.error) worker.postMessage({error:deferred.error})
                            else worker.postMessage({ deferred:deferred })
                        }else worker.postMessage(false)
                    }

                }else if(message.deferPayable){
                    
                    let payable = JSON.parse(message.deferPayable)
                    if(payable){
                        let deferred = await this.deferPayable(payable);
                        if(deferred){
                            if(deferred.error) worker.postMessage({error:deferred.error})
                            else worker.postMessage({ deferred:deferred })
                        }else worker.postMessage(false)
                    }

                }else if(message.emitContractAction){
                    
                    let contractAction = JSON.parse(message.emitContractAction)
                    if(contractAction){
                        let emitted = await this.emitContractAction(contractAction);
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
                        if(emitted){
                            if(emitted.error) worker.postMessage({error:emitted.error})
                            else worker.postMessage({ emitted:emitted })
                        }else worker.postMessage(false)
                    }
                    
                }else if(message.error){

                    this.events.emit(message.hash, {
                        error:message.error,
                        contractName:message.contractName
                    })

                }else if(message.log){
                    console.log(...message.log)
                }
            
           })

           resolve(worker)
        })
    }

    async getWorker(contractName){
        if(this.workers[contractName]){
            return this.workers[contractName]
        }else{
            let startBuildVM = process.hrtime()
            this.workers[contractName] = await this.buildVM({ contractName:contractName })
            let endBuildVM = process.hrtime(startBuildVM)
            blockExecutionDebug('Building worker', endBuildVM[1]/1000000)
            return this.workers[contractName];
        }
    }

    destroyVM(contractName){
        if(this.workers[contractName]) delete this.workers[contractName]
        return true
    }
    



    
}

module.exports = Bootstrap
