// const vmBootstrap = require('../contracts/vmEngine/vmBootstrap')
const vmBootstrap = require('../contracts/vmEngine/bootstrap')
const ContractConnector = require('../contracts/build/contractConnector')

class VMController{
    constructor({ contractTable, accountTable, buildCode, deferContractAction, emitContractAction, getCurrentBlock }){
        this.contractConnector = new ContractConnector({
            contractTable:contractTable
        });
        this.emitContractAction = emitContractAction
        this.deferContractAction = deferContractAction
        this.getCurrentBlock = getCurrentBlock
        this.vmBootstrap = new vmBootstrap({
            contractConnector:this.contractConnector,
            accountTable:accountTable,
            buildCode:buildCode,
            deferContractAction:this.deferContractAction,
            getCurrentBlock:this.getCurrentBlock,
            emitContractAction: this.emitContractAction
        });

        this.vmChannel = this.vmBootstrap.startVM()
        this.vmChannel.setMaxListeners(500)
    }

    // pushCallsToVM(calls){
    //     return new Promise(async(resolve)=>{
            
    //         let results = {}
    //         let errors = {}
    //         let states = {}
    //         this.vmChannel.emit('runCode', calls)
    //         this.vmChannel.on('results', async (results)=>{
                
                
    //             if(!results || Object.keys(results).length == 0){
    //                 resolve({error:'ERROR: Did not return results'})
    //             }else{  
    //                 if(results.error) resolve({error:results.error})
    //                 else{

    //                     for await(let hash of Object.keys(results)){
    //                         let result = results[hash]
    //                         if(result.error) errors[hash] = result
    //                         else{
    //                             if(result.state && Object.keys(result.state).length > 0){
    //                                 states[result.contractName] = result.state
    //                                 results[hash] = result
    //                             }else{
    //                                 errors[hash] = result
    //                             }
                                
    //                         }
    //                     }
        
    //                     if(Object.keys(errors).length > 0){
    //                         resolve({error:errors})
    //                     }else{
                            
    //                         for await(let contractName of Object.keys(states)){
    //                             let state = states[contractName]
    //                             if(state && Object.keys(state).length > 0){
    //                                 let updated = await this.contractConnector.updateState({
    //                                     name:contractName,
    //                                     newState:state,
    //                                 })
    //                                 if(updated.error) console.log('STATE ERROR:', updated.error)
                                    
    //                             }else{
    //                                 console.log('STATE ERROR: Did not update state because state provided by VM was empty')
    //                             }
    //                         }
    //                         resolve({ results:results, states:states })
                            
    //                     }
    //                 }
    //             }

                
                
    //         })
   
    //     })
        

    // }

    async executeCalls(codes){

        let calls = {}
        
        for await(let contractName of Object.keys(codes)){
            let contractCode = await this.contractConnector.getContractCode(contractName)
            if(contractCode){
                let added = await this.vmBootstrap.addContract(contractName, contractCode)
                if(added.error) return { error:added.error } 
                let state = await this.contractConnector.getState(contractName)
                if(state && Object.keys(state).length > 0){
                    
                    let stateAdded = await this.vmBootstrap.setContractState(contractName, state)
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
                
                
            }else{
                return { error:`Could not find code of contract ${contractName}` }
            }
        }
        
        let start = process.hrtime() /**  Checking execution time */
        let result = await this.sendCallsToVM(calls)
        let hrend = process.hrtime(start)

        // console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
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
                        if(updated.error) return { error:updated.error}

                        let terminated = await this.vmBootstrap.terminateVM(contractName)
                        if(terminated.error) return { error:terminated.error }
                        
                        return updated
                    }else{
                        return { error:'ERROR: Did not update state. New state has not been returned by any call' }
                    }
                }
                return { results:results, states:states }
            }

            
            
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
                let contractSent = await this.vmBootstrap.addContract(contractName)
                if(contractSent.error) resolve({ error:`ERROR: Contract ${code.contractName} does not exist` })
                
                let state = await this.contractConnector.getState(contractName)
                if(state){
                    let stateAdded = await this.vmBootstrap.setContractState(contractName, state)
                    if(stateAdded.error) resolve({ error:stateAdded.error })
                    timer = setTimeout(()=>{ resolve({error:'Call test failed. VM returned no result'}) }, 1000)
                    this.vmChannel.on(code.hash, async (result)=>{
                        
                        // let terminated = await this.vmBootstrap.terminateVM(contractName)
                        // if(terminated.error) resolve({ error:terminated.error })

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
                        
                        this.vmChannel.removeAllListeners(code.hash)
                    })
                    
                    this.vmChannel.emit('run', code)

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