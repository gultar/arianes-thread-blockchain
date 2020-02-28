// const vmBootstrap = require('../contracts/vmEngine/vmBootstrap')
const vmBootstrap = require('./vmEngine/bootstrap')
const ContractConnector = require('./contractConnector')
const { getDirectorySize } = require('../../tools/utils')
const controllerLog = require('debug')('controller')


let { accountTable } = require('../instances')

class VMController{
    constructor({
        contractTable,
        buildCode, 
        deferContractAction, 
        deferPayable, 
        emitContractAction, 
        emitPayable, 
        getCurrentBlock,
        getBalance,
        validatePayable }){

        this.getBalance = getBalance
        this.contractConnector = new ContractConnector({
            contractTable:contractTable
        });
        this.emitContractAction = emitContractAction
        this.emitPayable = emitPayable
        this.deferContractAction = deferContractAction
        this.deferPayable = deferPayable
        this.getCurrentBlock = getCurrentBlock
        this.buildCode = buildCode
        this.validatePayable = validatePayable
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
            buildCode:this.buildCode,
            getBalance:this.getBalance,
            deferContractAction:()=>{
                return { deferred:true }
            },
            getCurrentBlock:this.getCurrentBlock,
            emitContractAction: ()=>{
                return { emitted:true }
            },
            emitPayable:async (payable)=>{
                let valid = await this.emitPayable(payable, { isTest:true })
                return valid
            },
            deferPayable:async (payable)=>{
                let valid = await this.deferPayable(payable, { isTest:true })
                return valid
            }
        });
        this.testChannel = this.testBootstrap.startVM()

        this.vmChannel = this.vmBootstrap.startVM()
        this.vmChannel.setMaxListeners(500)
    }

    async executeCalls(codes){

        let calls = {}
        
        for await(let contractName of Object.keys(codes)){
            // let contractCode = await this.contractConnector.getContractCode(contractName)
            // controllerLog('Loaded contract code', (contractCode?true:false))
            // if(contractCode){
                
                
                
            // }else{
            //     return { error:`Could not find code of contract ${contractName}` }
            // }
            let added = await this.vmBootstrap.addContract(contractName)
                controllerLog('Contract code added to bootstraper', added)
                if(added.error) return { error:added.error } 

                let state = await this.contractConnector.getState(contractName)
                controllerLog('Contract state loaded', state)
                if(state && Object.keys(state).length > 0){
                    
                    let stateAdded = await this.vmBootstrap.setContractState(contractName, state)
                    controllerLog('Contract state added to bootstraper', stateAdded)
                    if(stateAdded.error) return { error:stateAdded.error }

                    let moreCalls = codes[contractName].calls
                    if(moreCalls){
                        
                        if(Object.keys(calls).length > 0) calls = { ...calls, ...moreCalls }
                        else calls = { ...moreCalls }
                        
                    }else{
                        return { error:`ERROR: Code payload of contract ${contractName} does not contain any calls` }
                    }
                }else{
                    return { error:`ERROR: Could not find state of ${contractName} while executing multiple calls` }
                }
        }
       
        
        // let start = process.hrtime() /**  Checking execution time */
        let result = await this.sendCallsToVM(calls)
        // let hrend = process.hrtime(start)

        // console.info('SendCallToVM: %ds %dms', hrend[0], hrend[1] / 1000000)
        if(result.error) return { error:result.error }
        else{
            let { results, state } = result;
            return { results:results, state:state }
        }

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
                        controllerLog('Updated state of contract '+contractName+' successfully:a', state)
                        if(updated.error) return { error:updated.error}
                        let terminated = await this.vmBootstrap.terminateVM(contractName)
                        controllerLog('VM closed', terminated)
                        if(terminated.error) return { error:terminated.error }
                        
                        // return updated
                    }else{
                        return { error:'ERROR: Did not update state. New state has not been returned by any call' }
                    }
                }
                return { results:results, states:states }
            }

            
            
            for await(let hash of Object.keys(calls)){
                
                let call = calls[hash]
                
                this.vmChannel.emit('run', call)
                controllerLog(`Emitted call ${hash.substr(0, 10)}... for execution`)
                this.vmChannel.on(call.hash, async (result)=>{
                        controllerLog('Controller received a result', result)
                        if(result.error ){
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
                            let updated = await updateStates(states)
                            
                            if(updated.error) resolve({error:updated.error})
                            else resolve({ results:results, state:states, updated:updated })
                        }
    
                        this.vmChannel.removeAllListeners(hash)
                })
                
            }

            
        })
    }

    test(code){
        return new Promise(async (resolve)=>{
            let contractName = code.contractName
            let timer = {}
            if(contractName){
                
                let contractSent = await this.testBootstrap.addContract(contractName)
                controllerLog('[TEST] Added contract code to bootstraper', contractSent)
                if(contractSent.error) resolve({ error:`ERROR: Contract ${code.contractName} does not exist` })
                
                let state = await this.contractConnector.getState(contractName)
                controllerLog('[TEST] Contract state loaded', state)
                if(state){
                    let stateAdded = await this.testBootstrap.setContractState(contractName, state)
                    controllerLog('[TEST] Contract code added to bootstraper', stateAdded)
                    if(stateAdded.error) resolve({ error:stateAdded.error })

                    timer = setTimeout(()=>{
                        controllerLog('[TEST] Timer kicked in, results were not sent in time') 
                        resolve({error:'Call test failed. VM returned no result'}) 
                    }, 1000)

                    this.testChannel.on(code.hash, async (result)=>{
                        // let terminated = await this.testBootstrap.terminateVM(contractName)
                        // if(terminated.error) resolve({ error:terminated.error })
                        controllerLog('[TEST] Received a result', result)
                        if(result && !result.error && result.value){
                            clearTimeout(timer)
                            resolve(result)
                        }else if(result.error){
                            clearTimeout(timer)
                            resolve({error:result.error})
                        }
                        
                        this.testChannel.removeAllListeners(code.hash)
                    })
                    controllerLog(`[TEST] Emitted call ${code.hash.substr(0, 10)}... for execution`)
                    this.testChannel.emit('run', code)

                }else{
                    resolve({error:`ERROR Could not find state of contract ${contractName}`})
                }
                
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