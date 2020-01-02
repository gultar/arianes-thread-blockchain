const Database = require('./db')

class StateStorage{
    constructor({ name, getCurrentBlock, getBlock }){
        this.name = name+'Storage'
        this.database = new Database(this.name)
        this.state = {};
        this.getCurrentBlock = getCurrentBlock
        this.getBlock = getBlock
        this.blockToStateMap = {}
        this.configSet = null;
    }

    async update(state){
        if(state && !state.error){
            let blockNumber = this.getCurrentBlock().blockNumber
            let previousBlock = this.getBlock(this.getCurrentBlock().blockNumber - 1)
            let previousState = {}
            this.state = state;
            if(Object.keys(this.state).length == 0 && Object.keys(previousState).length > 0){
                if(previousBlock){
                    previousState = await this.getClosestState(previousBlock.blockNumber)
                    
                    if(previousState){
                        if(previousState.error) return { error:previousState.error }
                        this.state = previousState
                    }
                }
                
            }
            
            let added = await this.database.put({
                id:blockNumber,
                key:blockNumber,
                value:{
                    state:this.state,
                    blockNumber:blockNumber,
                }
            })
            if(added.error) return { error:added.error }
            else return added
        }else{
            return { error:`ERROR: Cannot update state of ${this.name} with empty entry` }
        }
        
    }

    async save(){
        try{
            
            let blockNumber = this.getCurrentBlock().blockNumber
            if(!this.state || Object.keys(this.state).length == 0){
                let currentState = await this.getCurrentState()
                if(currentState && Object.keys(currentState).length > 0){
                    if(currentState.error) return { error:currentState.error } 

                    this.state = currentState
                }else{
                    let closestState = await this.getClosestState(blockNumber)
                    if(closestState && Object.keys(closestState).length > 0){
                        if(closestState.error) return { error:closestState.error }

                        this.state = closestState
                    }else{
                        return { error:'ERROR: Could not save state. State and closest state are empty' }
                    }
                }
                
            }
            
            let currentStateChanged = await this.database.put({
                id:'currentState',
                key:'currentState',
                value:{
                    state:this.state,
                    blockNumber:blockNumber,
                }
            })
            if(currentStateChanged.error) return { error:currentStateChanged }
            else if(currentStateChanged) return currentStateChanged
        }catch(e){
            
            return { error:e.message }
        }
    }

    async getCurrentState(){
        try{
           
            let { state, blockNumber } = await this.database.get('currentState');
            
            if(state){
                if(state.error) return { error:state.error }

                return state
            }else{
                return { error:`ERROR: Could not find current state of contract ${this.name} at block ${this.getCurrentBlock().blockNumber}` }
            }
        }catch(e){
            return {error:e.message}
        }
    }

    async getState(number){
        try{
           
            let { state, blockNumber } = await this.database.get(number);
            if(state){
                if(state.error) return { error:state.error }

                return state
            }else{
                state = await this.getClosestState(number)
                if(state){
                    if(state.error) return { error:state.error }
                    return state
                }else{
                    return { error:`ERROR: Could not find state of contract ${this.name} at block number ${number}` }
                }
                
            }
        }catch(e){
            return {error:e.message}
        }
    }

    async rollback(blockNumber){
        try{

            let state = await this.getState(blockNumber)
            if(state){
                if(state.error) return { error:state.error }
                this.state = state
                let saved = await this.save()
                
                if(saved.error) return { error:saved.error }
                else return saved
            }else{
                return { error:'ERROR Could not find state at block' }
                //means state does not exist beyond this blocknumber
            }
            
        }catch(e){
            return { error:e.message }
        }
        
    }
    
    //Mainly used when rolling back changes
    async getClosestState(blockNumber){
        try{
            let keys = await this.database.getAllKeys();
                if(keys){
                    //  10 13 14 17 19 20 21 22  get 18
                    let previousKey = ''
                    let closestState = false
                    for await(let key of keys){
                        if(key !== 'currentState'){
                            if(previousKey){
                                //Trying to get the state before a given blockNumber. Since states file are created when modified by transactions
                                //at given blocks, we need to find them by approximation
                                // console.log(`parseInt(${key}) > parseInt(${blockNumber}) && parseInt(${previousKey}) <= parseInt(${blockNumber})`)  // 
                                if(parseInt(key) > parseInt(blockNumber) && parseInt(previousKey) <= parseInt(blockNumber)){ // 
                                    let { state, blockNumber } = await this.database.get(previousKey)
                                    // console.log('Closest state',await this.database.get(previousKey))
                                    if(state && Object.keys(state).length > 0){
                                        if(state.error) return { error:state.error }
    
                                        return state
                                    }
                                    
                                    //success
                                }
                                
                            }
                            
                            previousKey = key
                        }
                        
                    }

                    return closestState
                }else{
                    return { error:'ERROR: State storage does not have keys yet' }
                }

        }catch(e){
            return { error:e.message }
        }
        
    }

    async destroyStorage(){
        let deleted = await this.database.destroy()
        if(deleted.error) return { error:deleted.error }
        else return deleted
    }

}



module.exports = StateStorage