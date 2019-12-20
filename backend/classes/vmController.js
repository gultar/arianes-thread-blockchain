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
                        if(result.state && Object.keys(result.state).length > 0){
                            states[result.contractName] = result.state
                            results[hash] = result
                        }else{
                            errors[hash] = result
                        }
                        
                    }
                }

                if(Object.keys(errors).length > 0){
                    resolve({error:errors})
                }else{
                    for await(let contractName of Object.keys(states)){
                        let state = states[contractName]
                        if(state && Object.keys(state).length > 0){
                            let updated = await this.contractConnector.updateState({
                                name:contractName,
                                newState:state,
                            })
                            if(updated.error) console.log('STATE ERROR:', updated.error)
                            
                        }else{
                            console.log('STATE ERROR: Did not update state because state provided by VM was empty')
                        }
                    }
                    resolve({ results:results, states:states })
                    
                }
                
            })
    
            this.vmChannel.on('finished', async ()=>{
                for await(let contractName of Object.keys(states)){
                    if(states[contractName]){
                        let state = states[contractName]
                        if(state && Object.keys(state).length > 0){
                            let updated = await this.contractConnector.updateState({
                                name:contractName,
                                newState:state,
                            })
                            if(updated.error) console.log('STATE ERROR:', updated.error)
                        }else{
                            console.log('STATE ERROR: Did not update state because state provided by VM was empty')
                        }
                    }
                    
                    
                }
                if(Object.keys(errors).length > 0){
                    console.log('CALL ERRORS: ', errors)
                    resolve({error:errors})
                }else{
                    resolve({ results:results, states:states })
                }
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
                        
                        if(result.state && Object.keys(result.state).length > 0){
                            states[result.contractName] = result.state
                            results[hash] = result
                        }else{
                            errors[hash] = result
                        }
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
                        return { error:`ERROR: Code payload of contract ${contractName} does not contain any calls` }
                    }
                }else{
                    return { error:`ERROR: Could not find state of ${contractName} while executing multiple calls` }
                }
                
                
            }else{
                return { error:`Could not find code of contract ${contractName}` }
            }
        }
        
        let result = await this.pushCallsToVM(calls)
        if(result.error) return { error:result.error }
        else{
            let { results, state } = result;
            return { results:results, state:state }
        }

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

    stop(){
        this.vmBootstrap.stop()
    }


}

module.exports = VMController