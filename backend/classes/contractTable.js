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
                resolve(stateEntry.state)
            }else{
                resolve(false)
            }
        })
    }

    updateContractState(name, newState){
        return new Promise(async (resolve)=>{
            if(name && newState){
                
                let state = await this.contractStateDB.get(name)
                if(state){
                    if(state.error) resolve({error:state.error})
                    
                    let added = await this.contractStateDB.add({
                        _id:state._id,
                        _rev:state._rev,
                        state:newState,
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



    
}

module.exports = ContractTable