// const vmBootstrap = require('../contracts/vmEngine/vmBootstrap')
const vmBootstrap = require('./vmEngine/bootstrap')
const ContractConnector = require('./contractConnector')
const { getDirectorySize } = require('../../tools/utils')
let blockExecutionDebug = require('debug')('blockExecution')

class VMController{
    constructor({ 
        contractTable, 
        accountTable, 
        buildCode, 
        deferContractAction, 
        deferPayable, 
        emitContractAction, 
        emitPayable, 
        getCurrentBlock,
        getBalance }){

        this.getBalance = getBalance
        this.contractConnector = new ContractConnector({
            contractTable:contractTable
        });
        this.emitContractAction = emitContractAction
        this.emitPayable = emitPayable
        this.deferContractAction = deferContractAction
        this.deferPayable = deferPayable
        this.getCurrentBlock = getCurrentBlock
        this.accountTable = accountTable
        this.buildCode = buildCode
        this.vmBootstrap = new vmBootstrap({
            contractConnector:this.contractConnector,
            accountTable:accountTable,
            buildCode:buildCode,
            deferContractAction:this.deferContractAction,
            getCurrentBlock:this.getCurrentBlock,
            emitContractAction: this.emitContractAction,
            emitPayable:this.emitPayable,
            deferPayable:this.deferPayable,
            getBalance:this.getBalance
        });
        this.testBootstrap = new vmBootstrap({
            contractConnector:this.contractConnector,
            accountTable:this.accountTable,
            buildCode:this.buildCode,
            getBalance:this.getBalance,
            deferContractAction:()=>{
                return { deferred:true }
            },
            getCurrentBlock:this.getCurrentBlock,
            emitContractAction: ()=>{
                return { emitted:true }
            },
            emitPayable:()=>{
                return { emitted:true }
            },
            deferPayable:()=>{
                return { deferred:true }
            }
        });
        this.testChannel = this.testBootstrap.startVM()

        this.vmChannel = this.vmBootstrap.startVM()
        this.vmChannel.setMaxListeners(500)
    }

    async verifyAvailableSpace(contractName){
        let size = await getDirectorySize(contractName+'Storage')
        let totalRessources = await this.contractTable.getTotalRAM(contractName)
    }

    async executeCalls(codes){
        
        let calls = {}
        let startExecute = process.hrtime() /**  Checking execution time */
        
        for await(let contractName of Object.keys(codes)){
            
            let stateAdded = await this.vmBootstrap.initContract(contractName)
            if(stateAdded.error) return { error:stateAdded.error }

            let moreCalls = codes[contractName].calls
            if(moreCalls){
                
                if(Object.keys(calls).length > 0) calls = { ...calls, ...moreCalls }
                else calls = { ...moreCalls }
                
            }else{
                return { error:`ERROR: Code payload of contract ${contractName} does not contain any calls` }
            }
            
            
        }
       
        let endExecute = process.hrtime(startExecute)

        blockExecutionDebug(`Init contracts ${endExecute[1] / 1000000}`)

        let start = process.hrtime() /**  Checking execution time */
        //let result = await this.sendCallsToVM(calls)
        let result = await this.submitCallsToVM(calls)
        let hrend = process.hrtime(start)

        blockExecutionDebug(`Send calls ${Object.keys(calls).length} to VM: ${hrend[1] / 1000000}`)
        if(result.error) return { error:result.error }
        else{
            let { results, state } = result;
            return { results:results, state:state }
        }

    }

    submitCallsToVM(calls){
        return new Promise(async (resolve)=>{
            let callsPending = { ...calls }
            let results = {}
            let errors = {}
            let states = {}
            const updateStates = async (states)=>{
                for await(let contractName of Object.keys(states)){
                    let state = states[contractName]
                    if(state && Object.keys(state).length > 0){
                        let updated = await this.contractConnector.updateState({
                            name:contractName,
                            newState:state,
                        })
                        if(updated.error) return { error:updated.error}

                        let terminated = await this.vmBootstrap.terminateVM(contractName)
                        if(terminated.error) return { error:terminated.error }
                        
                        // return updated
                    }else{
                        return { error:'ERROR: Did not update state. New state has not been returned by any call' }
                    }
                }
                return { results:results, states:states }
            }

            
            let sendCalls = process.hrtime()
            
            for await(let hash of Object.keys(calls)){
                this.vmChannel.on(hash, async (result)=>{
                        if(result.error){
                            errors[hash] = result
                        }else if(result.timeout){
                            errors[hash] = result
                        }else{
                            if(result.state && Object.keys(result.state).length > 0){
                                states[result.contractName] = result.state
                                results[hash] = result
                            }else{
                                errors[hash] = result
                            }
                        }
    
                        delete callsPending[hash]
                        if(Object.keys(callsPending).length == 0){
                            let startUpdate = process.hrtime()
                            let updated = await updateStates(states)
                            let endUpdate = process.hrtime(startUpdate)
                            blockExecutionDebug(`Update states: ${endUpdate[1]/1000000}`)
                            if(updated.error) resolve({error:updated.error})
                            else resolve({ results:results, state:states, updated:updated })
                        }
    
                        this.vmChannel.removeAllListeners(hash)
                })
            }

            this.vmChannel.emit('runCalls', calls)

            let endSendCalls = process.hrtime(sendCalls)
            blockExecutionDebug(`Send calls for await: ${endSendCalls[1]/1000000}`)
            
        })
    }

    sendCallsToVM(calls){
        return new Promise(async (resolve)=>{
            let callsPending = { ...calls }
            let results = {}
            let errors = {}
            let states = {}
            const updateStates = async (states)=>{
                for await(let contractName of Object.keys(states)){
                    let state = states[contractName]
                    if(state && Object.keys(state).length > 0){
                        let updated = await this.contractConnector.updateState({
                            name:contractName,
                            newState:state,
                        })
                        if(updated.error) return { error:updated.error}

                        let terminated = await this.vmBootstrap.terminateVM(contractName)
                        if(terminated.error) return { error:terminated.error }
                        
                        // return updated
                    }else{
                        return { error:'ERROR: Did not update state. New state has not been returned by any call' }
                    }
                }
                return { results:results, states:states }
            }

            
            let sendCalls = process.hrtime()
            for await(let hash of Object.keys(calls)){
                
                let call = calls[hash]
                this.vmChannel.emit('run', call)
                this.vmChannel.on(call.hash, async (result)=>{
                        if(result.error){
                            errors[hash] = result
                        }else if(result.timeout){
                            errors[hash] = result
                        }else{
                            if(result.state && Object.keys(result.state).length > 0){
                                states[result.contractName] = result.state
                                results[hash] = result
                            }else{
                                errors[hash] = result
                            }
                        }
    
                        delete callsPending[hash]
                        if(Object.keys(callsPending).length == 0){
                            let startUpdate = process.hrtime()
                            let updated = await updateStates(states)
                            let endUpdate = process.hrtime(startUpdate)
                            blockExecutionDebug(`Update states: ${endUpdate[1]/1000000}`)
                            if(updated.error) resolve({error:updated.error})
                            else resolve({ results:results, state:states, updated:updated })
                        }
    
                        this.vmChannel.removeAllListeners(hash)
                })
                
            }

            let endSendCalls = process.hrtime(sendCalls)
            blockExecutionDebug(`Send calls for await: ${endSendCalls[1]/1000000}`)
            
        })
    }

    test(code){
        return new Promise(async (resolve)=>{
            let contractName = code.contractName
            let timer = {}
            if(contractName){
                
                let stateAdded = await this.testBootstrap.initContract(contractName)
                if(stateAdded.error) return { error:stateAdded.error }

                timer = setTimeout(()=>{ resolve({error:'Call test failed. VM returned no result'}) }, 1000)
                    this.testChannel.on(code.hash, async (result)=>{
                        console.log('Result:', result)

                        if(result && !result.error && result.value){
                            clearTimeout(timer)
                            resolve(result)
                        }else if(result.error){
                            clearTimeout(timer)
                            resolve({error:result.error})
                        }else{
                            console.log('Returned something else', result)
                            // resolve(result)
                        }
                        
                        this.testChannel.removeAllListeners(code.hash)
                    })
                    
                    this.testChannel.emit('run', code)
                
            }else{
                resolve({error:'ERROR: Code to execute must contain name of contract'})
            }
        })

    }

    stop(){
        this.vmBootstrap.stop()
    }


}

module.exports = VMController