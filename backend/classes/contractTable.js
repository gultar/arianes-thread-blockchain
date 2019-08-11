const Database = require('./database')
const sha256 = require('../tools/sha256')

class ContractTable{
    constructor(){
        this.contractDB = new Database('./data/contractDB')
        this.contractStateDB = new Database('./data/contractStateDB')
    }

    addContract(contract){
        return new Promise(async (resolve)=>{
            
            let { name, contractAPI, initParams, account, code, state } = contract
            let alreadyExists = await this.contractDB.get(name)
            if(!alreadyExists){
                let added = await this.contractDB.add({
                    _id:name,
                    code:code,
                    initParams:initParams,
                    account:account,
                    contractAPI:contractAPI
                })
                let stateAdded = await this.addState(name, state);
                if(stateAdded.error) resolve({error:stateAdded})

                if(added.error)resolve({error:added.error})
                resolve({contractAdded:added, stateAdded:stateAdded})
            }else{
                resolve({error:'A contract with that name already exists'})
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
            let stateEntry = await this.contractStateDB.get(name)
            if(stateEntry){
                if(stateEntry.error) resolve({error:stateEntry.error})
                resolve(stateEntry.state)
            }else{
                resolve(false)
            }
        })
    }

    getStateOfAction(contractName, hash){
        return new Promise(async (resolve)=>{
            let stateEntry = await this.contractStateDB.get(contractName)
            if(stateEntry){
                if(stateEntry.error) resolve({error:stateEntry.error})
                let state = stateEntry.changes[hash]
                resolve(state)
            }else{
                resolve(false)
            }
        })
    }

    getStateEntry(name){
        return new Promise(async (resolve)=>{
            let state = await this.contractStateDB.get(name)
            resolve(state)
        })
    }


    updateContractState(name, newState, action){
        return new Promise(async (resolve)=>{
            if(name && newState){
                
                let state = await this.contractStateDB.get(name)
                if(state){
                    if(state.error) resolve({error:state.error})

                    let previousChanges = state.changes
                    
                    previousChanges[action.hash] = newState

                    let added = await this.contractStateDB.add({
                        _id:state._id,
                        _rev:state._rev,
                        state:newState,
                        changes:previousChanges
                    })
                    if(added.error)resolve({error:added.error})
                    else resolve(added)
                }else{
                    resolve({error:`Could not find contract named ${name}`})
                }
            }else{
                resolve({error:`ERROR: Could not update state. Missing required parameters (name, state)`})
            }
            
            
        })
    }

    removeContract(name){
            return new Promise(async (resolve)=>{
                
                let contract = await this.contractDB.get(name)
                if(contract){
                    let deleted = await this.contractDB.delete(contract)
                    if(deleted.error) resolve({error:deleted.error})

                    let stateDeleted = await this.removeState(name);
                    if(stateDeleted.error) resolve({error:stateDeleted.error})
    
                    resolve({contractDeleted:deleted, stateDeleted:stateDeleted})
                }else{
                    resolve({error:'Contract to delete does not exist'})
                }
                
            })
    }

    removeState(name){
        return new Promise(async (resolve)=>{
            if(!name) resolve({error:'Could not remove contract state. Name of contract undefined '})

            let state = await this.contractStateDB.get(name);
            if(state){
                if(state.error) resolve({error:state.error})
                let stateDeleted = await this.contractStateDB.delete(state)
                if(stateDeleted.error) resolve({error:stateDeleted.error})
                else resolve(stateDeleted)
            }else{
                resolve({error:'State to delete does not exist'})
            }
            
        })
    }

    rollbackActionBlock(actions){
        return new Promise(async (resolve)=>{
            if(actions){
                let actionHashes = Object.keys(actions)
                let errors = {}
                for await (var hash of actionHashes){
                    let action = actions[hash]
                    let contractName = action.data.contractName
                    let rolledBack = await this.rollbackState(contractName, action)
                    if(rolledBack.error){ errors[hash] = rolledBack.error }
                }

                if(Object.keys(errors).length > 0) resolve({error:errors})
                else resolve(true)
                
            }else{
                resolve({error:'Block of actions to rollback is undefined'})
            }
        })
    }

    rollbackState(name, action){
        return new Promise(async (resolve)=>{
            if(name && action){
                let state = await this.contractStateDB.get(name)
                if(state){
                    if(state.error) resolve({error:state.error})
                    let stateAtAction = await this.getStateOfAction(name, action.hash)
                    if(stateAtAction){
                        if(stateAtAction.error) resolve({error:stateAtAction.error})

                        let previousChanges = state.changes

                        if(previousChanges){

                            let actionHashes = Object.keys(previousChanges)
                            let indexOfLastAction = actionHashes.length;
                            let positionOfAction = actionHashes.indexOf(action.hash)
                            let numberOfActionsToRemove = indexOfLastAction - positionOfAction
                            let actionsToRemove = actionHashes.splice(positionOfAction, numberOfActionsToRemove)
                            if(numberOfActionsToRemove > 0){
                                for await(var hashOfAction of actionsToRemove){
                                    delete previousChanges[hashOfAction];
                                }
        
                                let added = await this.contractStateDB.add({
                                    _id:state._id,
                                    _rev:state._rev,
                                    state:stateAtAction,
                                    changes:previousChanges
                                })
                                resolve(added)
                            }else{
                                resolve({error:`No actions to remove during rollback of contract ${name}`})
                            }
                            
                        }else{

                        }
                        

                    }else{
                        resolve({error:`Could not find contract state at specific action of contract ${name}`})
                    }


                }else{
                    resolve({error:`Could not find state of contract ${name}`})
                }
            }else{
                resolve({error:'ROLLBACK ERROR: Missing required parameters: name, action'})
            }
        })
    }



    
}

module.exports = ContractTable