const store = require('rocket-store')
const Database = require('./db')

class ContractStateStore{
    constructor({ name, getCurrentBlock, getBlock }){
        this.name = name+'Storage'
        this.database = new Database(this.name)
        this.state = {};
        this.getCurrentBlock = getCurrentBlock
        this.getBlock = getBlock
        this.history = {}
        this.configSet = null;
    }

    async update(state){
        if(state && !state.error){
            
            this.state = state;
            return true
        }else{
            return { error:`ERROR: Cannot update state of ${this.name} with empty entry` }
        }
        
    }

    async save(){
        try{
            let hash = this.getCurrentBlock().hash
            let previousBlock = this.getBlock(this.getCurrentBlock().blockNumber - 1)
            let previousState = {}
            if(previousBlock){
                previousState = await this.getState(previousBlock.hash)
                if(previousState && !previousState.error){
                    if(Object.keys(this.state).length == 0 && Object.keys(previousState).length > 0){
                        this.state = previousState
                    }
                }
            }
            let added = await this.database.put({
                id:hash,
                key:hash,
                value:{
                    state:this.state,
                    hash:hash,
                }
            })
            if(added.error) return { error:added.error }
            else return added
        }catch(e){
            
            return { error:e.message }
        }
    }

    async getCurrentState(){
        try{
           
            let { state, hash } = await this.database.get(this.getCurrentBlock().hash);
            
            if(state){
                if(state.error) return { error:state.error }

                return state
            }else{
                return { error:`ERROR: Could not find current state of contract ${this.name} at block ${this.getCurrentBlock().hash}` }
            }
        }catch(e){
            return {error:e}
        }
    }

    async getState(blockHash){
        try{
           
            let { state, hash } = await this.database.get(blockHash);
            
            if(state){
                if(state.error) return { error:state.error }

                return state
            }else{
                return { error:`ERROR: Could not find state of contract ${this.name} at block ${blockHash}` }
            }
        }catch(e){
            return {error:e}
        }
    }

    async rollback(blockHash){
        try{
            if(blockHash){
                let state = await this.getState(blockHash)
                if(state){
                    if(state.error) return { error:state.error }
                    else{
                        //Need to find a way to clean up unused state entries of blocks
                        this.state = state;
                        let added = await this.database.put({
                            id:blockHash,
                            key:blockHash,
                            value:{
                                state:this.state,
                                hash:blockHash,
                            }
                        })
                        if(added.error) return { error:added.error }
                        else return added
                    }
                }else{
                    return { error:`ERROR: Could not rollback to block ${blockHash}. State at this block does not exist` }
                }
            }else{
                return { error:`ERROR: Cannot rollback contract state of ${this.name} to undefined block hash` }
            }
        }catch(e){
            return {error:e}
        }
    }
}

module.exports = ContractStateStore