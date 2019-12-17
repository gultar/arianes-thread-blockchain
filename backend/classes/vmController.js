const vmMaster = require('../contracts/vmEngine/vmMaster')
const vmBootstrap = require('../contracts/vmEngine/vmBootstrap')
const ContractConnector = require('../contracts/build/contractConnector')

class VMController{
    constructor({ contractTable }){
        this.vmMaster = vmMaster;
        this.contractConnector = new ContractConnector({
            contractTable:contractTable
        });
        
        this.vmBootstrap = new vmBootstrap({
            contractConnector:this.contractConnector
        });

        this.vmChannel = this.vmBootstrap.startVM()
        this.vmChannel.setMaxListeners(500)
    }

    // async execute({ codes, timeLimit, memoryLimit }){
    //     if(!timeLimit || typeof timeLimit !== 'number') return { error:'ERROR: Invalid timeLimit type. Must be integer' }
    //     if(!memoryLimit || typeof memoryLimit !== 'number') return { error:'ERROR: Invalid memoryLimit type. Must be integer' }

    //     let resultPusher = await this.vmMaster({
    //         codes:codes,
    //         timeLimit:timeLimit,
    //         memoryLimit:memoryLimit,
    //         contractConnector:this.contractConnector,
    //         updateState:true
    //     })

    //     return resultPusher

    // }

    // executeSingleCode(code){
    //     return new Promise(async (resolve)=>{
    //         let contractName = code.contractName
            
    //         if(contractName){
    //             let contractSent = await this.vmBootstrap.addContract(contractName)
    //             if(contractSent.error) resolve({ error:`ERROR: Contract ${code.contractName} does not exist` })
                
    //             let state = await this.contractConnector.getState(contractName)
                
    //             if(state){
    //                 let stateAdded = await this.vmBootstrap.setContractState(contractName, state)
    //                 if(stateAdded.error) return { error:stateAdded.error }

    //                 this.vmChannel.on(code.hash, async (result)=>{
    //                     this.vmChannel.removeAllListeners(code.hash)
    //                     if(result.timeout){
    //                         resolve({ error:result.timeout })
    //                     }else if(result.error){
    //                         resolve({ error:result.error })
    //                     }else{
                            
    //                         let updated = await this.contractConnector.updateState({
    //                             name:code.contractName,
    //                             newState:result.executed.state,
    //                             call:code.hash
    //                         })
                            
    //                         if(updated.error) resolve({error:updated.error})
    //                         else resolve(result)
    //                     }
                        
    //                 })
    //                 this.vmChannel.emit('run', code)

    //             }else{

    //             }
                
    //         }else{
    //             resolve('ERROR: Code to execute must contain name of contract')
    //         }
    //     })
    // }

    // async executeMultiple(codes){

    //     let calls = {}
    //     let results = {}
    //     let errors = {}
    //     for await(let contractName of Object.keys(codes)){
    //         let contractCode = await this.contractConnector.getContractCode(contractName)
    //         if(contractCode){
    //             let added = await this.vmBootstrap.addContract(contractName, contractCode)
    //             let state = await this.contractConnector.getState(contractName)
    //             if(state){
    //                 let stateAdded = await this.vmBootstrap.setContractState(contractName, state)
    //                 if(stateAdded.error) return { error:stateAdded.error }

    //                 let moreCalls = codes[contractName].calls
    //                 if(moreCalls){
                        
    //                     if(Object.keys(calls).length > 0) calls = { ...calls, ...moreCalls }
    //                     else calls = { ...moreCalls }
                        
    //                 }else{
    //                     return { error:`Code payload of contract ${contractName} does not contain any calls` }
    //                 }
    //             }else{
    //                 return { error:`ERROR: Could not find state of ${contractName} while executing multiple calls` }
    //             }
                
                
    //         }else{
    //             return { error:`Could not find code of contract ${contractName}` }
    //         }
    //     }
        
    //     for await(let hash of Object.keys(calls)){
    //         let call = calls[hash]
    //         let result = await this.executeSingleCode(call)
            
    //         if(!result.error){
    //             results[hash] = result
    //         }
    //         else{
    //             errors[hash] = {
    //                 error:result.error
    //             }
    //         }
    //     }

    //     return { results:results, errors:errors }

    // }

    pushCallsToVM(calls){
        return new Promise(async(resolve)=>{
            let results = {}
            let errors = {}
            let states = {}
            
            this.vmChannel.on('results', async (results)=>{
                for await(let hash of Object.keys(results)){
                    let result = results[hash]
                    
                    if(results.error) errors[hash] = result
                    else{
                        results[hash] = result
                        states[result.contractName] = result.state
                    }
                }
            })
    
            this.vmChannel.on('finished', async ()=>{
                for await(let contractName of Object.keys(states)){
                    let state = states[contractName]
                    let updated = await this.contractConnector.updateState({
                        name:contractName,
                        newState:state,
                    })
                }
                resolve({ results:results, errors:errors, states:states })
            })
            this.vmChannel.emit('runCode', calls)
            for await(let hash of Object.keys(calls)){
                let call = calls[hash]
                this.vmChannel.on(call.hash, async (result)=>{
                    
                    if(result.error){
                        errors[hash] = result
                    }else if(result.timeout){
                        errors[hash] = result
                    }else{
                        
                        results[hash] = result
                        states[result.contractName] = result.state
                    }
                    this.vmChannel.removeAllListeners(call.hash)
                })
                
            }
            
        })
        

    }

    async executeCalls(codes){

        let calls = {}
        
        for await(let contractName of Object.keys(codes)){
            let contractCode = await this.contractConnector.getContractCode(contractName)
            if(contractCode){
                let added = await this.vmBootstrap.addContract(contractName, contractCode)
                if(added.error) return { error:added.error } 
                let state = await this.contractConnector.getState(contractName)
                if(state){
                    let stateAdded = await this.vmBootstrap.setContractState(contractName, state)
                    if(stateAdded.error) return { error:stateAdded.error }

                    let moreCalls = codes[contractName].calls
                    if(moreCalls){
                        
                        if(Object.keys(calls).length > 0) calls = { ...calls, ...moreCalls }
                        else calls = { ...moreCalls }
                        
                    }else{
                        console.log('ERROR: ', codes)
                        return { error:`ERROR: Code payload of contract ${contractName} does not contain any calls` }
                    }
                }else{
                    return { error:`ERROR: Could not find state of ${contractName} while executing multiple calls` }
                }
                
                
            }else{
                return { error:`Could not find code of contract ${contractName}` }
            }
        }
        
        let { results, errors, states } = await this.pushCallsToVM(calls)

        return { results:results, errors:errors }

    }

    test(code){
        return new Promise(async (resolve)=>{
            let contractName = code.contractName
            
            if(contractName){
                let contractSent = await this.vmBootstrap.addContract(contractName)
                if(contractSent.error) resolve({ error:`ERROR: Contract ${code.contractName} does not exist` })
                
                let state = await this.contractConnector.getState(contractName)
                if(state){
                    let stateAdded = await this.vmBootstrap.setContractState(contractName, state)
                    if(stateAdded.error) return { error:stateAdded.error }

                    this.vmChannel.on(code.hash, async (result)=>{
                        
                        if(result && !result.timeout){
                            resolve(result)
                        }else if(result.timeout){
                            resolve({ error:result.timeout })
                        }else if(result.error){
                            resolve({error:result.error})
                        }
                        
                        this.vmChannel.removeAllListeners(code.hash)
                    })
                    
                    this.vmChannel.emit('run', code)

                }else{

                }
                
            }else{
                resolve({error:'ERROR: Code to execute must contain name of contract'})
            }
        })

    }


}

module.exports = VMController