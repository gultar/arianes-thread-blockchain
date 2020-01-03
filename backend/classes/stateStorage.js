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
        if(state && Object.keys(state).length > 0 && !state.error){
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
            let currentStateChanged = await this.database.put({
                id:'currentState',
                key:'currentState',
                value:{
                    state:this.state,
                    blockNumber:blockNumber,
                }
            })
            if(currentStateChanged.error) return { error:currentStateChanged }
            if(added.error) return { error:added.error }
            else return added
        }else{
            console.log('State provided:', state)
            return { error:`ERROR: Cannot update state of ${this.name} with empty entry` }
        }
        
    }

    async save(){
        try{
            
            let blockNumber = this.getCurrentBlock().blockNumber
            if(!this.state || Object.keys(this.state).length == 0){
                console.log('No state found. Getting previous current state')
                let currentState = await this.getCurrentState()
                if(currentState && Object.keys(currentState).length > 0){
                    if(currentState.error) return { error:currentState.error } 
                    console.log(`Previous current state at block ${blockNumber}: ${currentState}`)
                    this.state = currentState
                }else{
                    let closestState = await this.getClosestState(blockNumber)
                    if(closestState && Object.keys(closestState).length > 0){
                        if(closestState.error) return { error:closestState.error }
                        console.log('About to save the latest state', closestState)
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
                
                let closestState = await this.getLatestState()
                if(closestState){
                    if(closestState.error) return { error:closestState.error }
                    console.log('Getting latest state', closestState)
                    return closestState
                }else{
                    return { error:`ERROR: Could not find current state of contract ${this.name} at block ${this.getCurrentBlock().blockNumber}` }
                }
                
            }
        }catch(e){
            return {error:e.message}
        }
    }

    async getState(number){
        try{
            if(typeof number == 'number'){
                number = number.toString()
            }
            console.log('Getting state of ', number)
            let { state, blockNumber } = await this.database.get(number);
            if(state){
                if(state.error) return { error:state.error }
                console.log('Has state:', state)
                return state
            }else{
                console.log('Getting closestState')
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
            console.log('Rolling back to state', blockNumber)
            let state = await this.getClosestState(blockNumber)
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
    async getClosestState(blockNumberString){
        try{
            let blockNumber = parseInt(blockNumberString)
            let keys = await this.database.getAllKeys();
                if(keys){
                    let blockNumbers = await this.parseBlockNumbers(keys); //Desceding
                    let previousNumber = 0
                    let latestBlockNumber = blockNumbers[0]
                    console.log('Blocknumber:', blockNumber)
                    console.log('Latest', latestBlockNumber)
                    if(blockNumber < latestBlockNumber){
                        console.log('Is lower than latest')
                        //Tries to find the block number of the closest state to the requested blockNumber
                        for await(let number of blockNumbers){
                            
                            if(number < blockNumber && previousNumber >= blockNumber){
                                let { state } = await this.database.get(number.toString())
                                        // console.log('Closest state',await this.database.get(previousKey))
                                if(state && Object.keys(state).length > 0){
                                    if(state.error) return { error:state.error }
    
                                    return state
                                }else{
                                    return { error:`ERROR: Closest state to ${blockNumber} is empty` }
                                }
                            }
                            previousNumber = number
                        }
                        //Returns the first ever state registered
                        let { state } = await this.database.get(previousNumber.toString())
                        // console.log('Closest state',await this.database.get(previousKey))
                        if(state && Object.keys(state).length > 0){
                            if(state.error) return { error:state.error }

                            return state
                        }else{
                            return { error:`ERROR: Closest state to ${blockNumber} is empty` }
                        }
                    }else{
                        console.log('Is higher than latest')
                        //Returns the latest state registered
                        let { state } = await this.database.get(latestBlockNumber.toString())
                                        // console.log('Closest state',await this.database.get(previousKey))
                        if(state && Object.keys(state).length > 0){
                            if(state.error) return { error:state.error }

                            return state
                        }else{
                            return { error:`ERROR: Closest state to ${blockNumber} is empty` }
                        }
                    }
                    
                    
                }else{
                    return { error:'ERROR: State storage does not have keys yet' }
                }

        }catch(e){
            return { error:e.message }
        }
        
    }

    

    async getLatestState(){
        try{
            let keys = await this.database.getAllKeys();
                if(keys){
                    
                    let sortedBlockNumbers = await this.parseBlockNumbers(keys)
                    let latestBlockNumber = sortedBlockNumbers[0]
                    let latestState = await this.getClosestState(latestBlockNumber.toString())
                    return latestState
                    // let latestState = false
                    // let currentState = keys.pop()
                    
                    // let latestKey = keys[keys.length - 1]
                    // 
                }else{
                    return { error:'ERROR: State storage does not have keys yet' }
                }

        }catch(e){
            return { error:e.message }
        }
        
    }

    async parseBlockNumbers(keys){
        try{
            let blockNumbers = []

            for await(let number of keys){
                if(number !== 'currentState'){
                    blockNumbers.push(parseInt(number))
                }
            }

            let sortedBlockNumbers = blockNumbers.sort((a,b)=>b-a)
            return sortedBlockNumbers
        }catch(e){
            return { error:e.message }
        }
    }

    async getLatestKey(){
        try{
            let keys = await this.database.getAllKeys();
                if(keys){
                    let sortedBlockNumbers = await this.parseBlockNumbers(keys)
                    return sortedBlockNumbers[0]
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