

class ContractConnector{
    constructor({ contractTable }){
        this.contactTable = contractTable
    }

    async getContractCode(contractName){
        if(contractName){
            let contract = await this.contactTable.getContract(contractName)
            if(contract.error) return { error:contract.error }
            else if(contract){
                return contract.code
            }else{
                return false
            }

        }else{
            return { error:'Need to provide name of contract to fetch' }
        }
    }

    getState(contractName){
       return new Promise(async (resolve)=>{
        if(contractName){
            let state = await this.contactTable.getState(contractName)
            if(state.error) resolve({ error:state.error })
            else if(state){
                resolve(state)
            }else{
                resolve(false)
            }

        }else{
            return { error:'Need to provide name of contract to fetch' }
        }
       }) 
    }

    async updateState({name, newState}){
        if(!name) return { error:'ERROR Need to provide name of the contract state to update' }
        else if(!newState || typeof newState !== 'object') return { error:'ERROR: Need to provide valid state object' }
        else{
            
            let updated = await this.contactTable.updateContractState(name, newState)
            if(updated.error) return { error:updated.error }
            else{
                return updated
            }
        }
    }

    
}

module.exports = ContractConnector