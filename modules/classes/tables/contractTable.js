// const Database = require('./database')
const Database = require('../database/db')
const sha256 = require('../../tools/sha256')
const StateStorage = require('../contracts/statePersistance')

class ContractTable{
    constructor({ getCurrentBlock, getBlock, getBlockFromHash }){
        this.getCurrentBlock = getCurrentBlock;
        this.getBlock = getBlock
        this.getBlockFromHash = getBlockFromHash
        this.contractDB = new Database('contracts')
        this.contractStateDB = new Database('states')
        this.stateStorage = {}
        this.stateMemory = {}
    }

    async init(){
        let contractNames = await this.getAllContractNames()

        for await(let name of contractNames){
            
            this.stateStorage[name] = new StateStorage({
                name:name,
                getCurrentBlock:async ()=>{
                    return await this.getCurrentBlock()
                },
                getBlock:(number)=>{
                    return this.getBlock(number)
                },
                getBlockFromHash:(hash)=>{
                    return this.getBlockFromHash(hash)
                }
            })

            await this.stateStorage[name].init()
        }

        return true
    }


    addContract(contract){
        return new Promise(async (resolve)=>{
            
            let { name, contractAPI, initParams, account, code, state, totalRAM } = contract
            
            let alreadyExists = await this.contractDB.get(name)
            if(!alreadyExists){
                let added = await this.contractDB.add({
                    _id:name,
                    name:name,
                    code:code,
                    initParams:initParams,
                    account:account,
                    contractAPI:contractAPI,
                    totalRAM:totalRAM
                })

                if(added){
                    if(added.error) resolve({error:added.error})
                    else{
                        this.stateStorage[name] = new StateStorage({
                            name:name,
                            getCurrentBlock:async ()=>{
                                return await this.getCurrentBlock()
                            },
                            getBlock:(number)=>{
                                return this.getBlock(number)
                            },
                            getBlockFromHash:(hash)=>{
                                return this.getBlockFromHash(hash)
                            }
                            
                        })
                        let currentBlock = await this.getCurrentBlock()


                        this.stateStorage[name].state = state;
                        let updated = await this.stateStorage[name].update(state, currentBlock.blockNumber)
                        
                        if(updated.error) resolve({error:updated.error})
                        else resolve(updated)
                    }
                }else{
                    resolve({ error:`ERROR: Creation of contract ${name} failed. Could not create contract entry` })
                }
                
            }else{
                
                resolve({error:'A contract with that name already exists'})
            }
            
        })
    }

    getAllContractNames(){
        return new Promise(async (resolve)=>{
            let names = []
            let contracts =  await this.contractDB.getAll()
            for await(let contract of contracts){
                names.push(contract._id)
            }
            resolve(names)
        })
    }

    async addRAM(contractName, amount){
        if(contractName && amount){
            if(typeof amount !== 'number' || amount < 0) 
                return { error:'ERROR: Amount of ram to allocate needs to be a positive number' }

            let contract = await this.contractDB.get(contractName);
            let currentRAM = contract.totalRAM;
            let totalRAM = currentRAM + amount
            let added = await this.contractDB.add({
                _id:contract.name,
                name:contract.name,
                code:contract.code,
                initParams:contract.initParams,
                account:contract.account,
                contractAPI:contract.contractAPI,
                totalRAM:totalRAM
            })
            if(added.error) return { error:added.error }
            else return added
        }
    }

    loadStateStore(contractName){
        return new Promise(async (resolve)=>{
            if(contractName){
                let contractExists = await this.contractDB.get(contractName)
                if(contractExists.error) resolve({error:contractExists.error})

                this.stateStorage[contractName] = new StateStorage({
                    name:contractName,
                    getCurrentBlock:async ()=>{
                        return await this.getCurrentBlock()
                    },
                    getBlock:(number)=>{
                        return this.getBlock(number)
                    },
                    getBlockFromHash:(hash)=>{
                        return this.getBlockFromHash(hash)
                    }
                })
            }else{
                resolve({ error:`ERROR: Could not load store of contract ${contractName}` })
            }
        })
    }

    addState(name, newState){
        return new Promise(async (resolve)=>{
            if(!name) resolve({error:'Could not add contract state. Name of contract undefined '})
            if(!newState) resolve({error:'Could not add contract state. contract state is undefined '})

            let stateAdded = await this.contractStateDB.add({
                _id:name,
                state:newState.state,
                changes:{}
            })
            if(stateAdded.error) resolve({error:stateAdded.error})
            else resolve(stateAdded)
        })
    }

    getContract(name){
        return new Promise(async (resolve)=>{
            let contract = await this.contractDB.get(name)
            if(contract){
                resolve(contract)
            }else{
                resolve(false)
            }
        })
    }

    getState(name){
        return new Promise(async (resolve)=>{
            if(this.stateStorage[name]){
                if(this.stateMemory[name]){
                    resolve(this.stateMemory[name])
                }else{
                    let currentBlock = await this.getCurrentBlock()
                    let state = await this.stateStorage[name].getState(currentBlock.blockNumber)
                    if(state.error) resolve({error:state.error})
                    else resolve(state)
                }
                
            }else{
                resolve({error:`ERROR: State does not exist for contract ${name}`})
            }
            
        })
    }


    saveStates(block){
        return new Promise(async (resolve)=>{
            for await(let contractName of Object.keys(this.stateStorage)){
                if(this.stateStorage[contractName]){
                    let saved = await this.stateStorage[contractName].save(block)
                
                    if(saved.error) resolve({error:saved.error})
                }
                
            }

            resolve(true)
        })
    }

    updateContractState(name, newState){
        return new Promise(async (resolve)=>{
            if(name && newState){
                
                if(this.stateStorage[name]){
                    let currentBlock = await this.getCurrentBlock()
                    
                    let updated = await this.stateStorage[name].update(newState, currentBlock.blockNumber)
                    if(updated.error) resolve({error:updated.error})
                    else{
                        this.stateMemory[name] = newState
                        resolve(true)
                    }
                    
                }else{
                    resolve({error:`ERROR: Could not update state of contract ${name}. Storage does not exist or is not loaded`})
                }
               
            }else{
                resolve({error:`ERROR: Could not update state. Missing required parameters (name, state)`})
            }
            
            
        })
    }

    updateStates(){
        return new Promise(async (resolve)=>{
            for await(let name of Object.keys(this.stateStorage)){
                if(this.stateStorage[name]){
                    let currentBlock = await this.getCurrentBlock()
                    //Making sure all states are saved upon new block
                    let updated = await this.stateStorage[name].update(false, currentBlock.blockNumber)
                    if(updated.error) resolve({error:updated.error})
                    else{
                        this.stateMemory[name] = this.stateStorage[name].getLatestState()
                        resolve(true)
                    }
                    
                }else{
                    resolve({error:`ERROR: Could not update state of contract ${name}. Storage does not exist or is not loaded`})
                }
            }
            resolve(true)
        })
    }

    saveState(name){
        return new Promise(async (resolve)=>{
            if(name){
                
                if(this.stateStorage[name]){
                    
                    let saved = await this.stateStorage[name].save()
                    if(saved.error) resolve({error:saved.error})
                    else saved
                    
                }else{
                    resolve({error:`ERROR: Could not save state of contract ${name}. Storage does not exist or is not loaded`})
                }
               
            }else{
                resolve({error:`ERROR: Could not save state. Missing required parameters (name)`})
            }
            
            
        })
    }

    removeContract(name){
            return new Promise(async (resolve)=>{
                
                let contract = await this.contractDB.get(name)
                if(contract){
                    let deleted = await this.contractDB.deleteId(name)
                    if(deleted.error) resolve({error:deleted.error})
                    let stateDeleted = await this.removeState(name);
                    if(stateDeleted.error) resolve({error:stateDeleted.error})
    
                    resolve({contractDeleted:deleted, stateDeleted:stateDeleted})
                }else{
                    resolve({error:'Contract to delete does not exist'})
                }
                
            })
    }

    async removeState(contractName){
        if(!contractName) return {error:'Could not remove contract state. Name of contract undefined '}
            let storage = this.stateStorage[contractName]
            if(!storage) return { error:`ERROR: State storage at ${contractName} is not a proper instance of ContractStateStorage` }
            else{
                
                let removedState = await storage.destroyStorage()
                if(removedState.error) return { error:removedState.error }
                return removedState
            }
    }

    // async rollback(blockNumber, block=false){
    //     if(blockNumber){
    //         for await(let contractName of Object.keys(this.stateStorage)){
    //             let storage = this.stateStorage[contractName]
    //             if(!storage) return { error:`ERROR: State storage at ${contractName} is not a proper instance of ContractStateStorage` }
    //             else{
    //                 let rolledBack = await storage.rollback(blockNumber, block)
    //                 if(rolledBack.error) return { error:rolledBack.error }

    //                 this.stateMemory[contractName] = rolledBack
    //             }
    //         }
    //         return true
    //     }else{
    //         return { error:'ERROR: Roll back incomplete. Block hash provided is undefined' }
    //     }
    // }

    async rollbackBlock(blockNumber){
        if(blockNumber){
            for await(let contractName of Object.keys(this.stateStorage)){
                let storage = this.stateStorage[contractName]
                if(!storage) return { error:`ERROR: State storage at ${contractName} is not a proper instance of ContractStateStorage` }
                else{
                    let rolledBack = await storage.rollbackBlock(blockNumber)
                    if(rolledBack.destroy) return await this.removeState(contractName)
                    if(rolledBack.error) return { error:rolledBack.error }

                    this.stateMemory[contractName] = rolledBack
                }
            }
            return true
        }else{
            return { error:'ERROR: Roll back incomplete. Block hash provided is undefined' }
        }
    }

    
}


module.exports = ContractTable
