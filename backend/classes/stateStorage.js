const Database = require('./db')

class StateStorage{
    constructor({ name, getCurrentBlock, getBlock }){
        this.name = name+'Storage'
        this.database = new Database(this.name)
        this.state = {};
        this.latestState = {}
        this.getCurrentBlock = getCurrentBlock
        this.getBlock = getBlock
        this.blockToStateMap = {}
        this.configSet = null;
    }

    async update(state){
        if(state && Object.keys(state).length > 0 && !state.error){
            let currentBlock = this.getCurrentBlock();
            let timestamp = currentBlock.timestamp
            
            this.state = state;
            
            let added = await this.database.put({
                key:timestamp,
                value:{
                    state:this.state,
                    timestamp:timestamp,                        //Because the newest block is still being merged. 
                    blockNumber:currentBlock.blockNumber    //Current block is pointing towards the previousblock                                                                
                }
            })
            let currentStateChanged = await this.database.put({
                key:'currentState',
                value:{
                    state:this.state,
                    timestamp:timestamp,
                    blockNumber:currentBlock.blockNumber
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

    async save(state = undefined){
        try{
            
            let currentBlock = this.getCurrentBlock()
            let timestamp = currentBlock.timestamp

            // // if(!this.state || Object.keys(this.state).length == 0){
            // //     console.log('No state found. Getting previous current state')
            // //     let currentState = await this.getCurrentState()
            // //     if(currentState && Object.keys(currentState).length > 0){
            // //         if(currentState.error) return { error:currentState.error } 
            // //         console.log(`Previous current state at block ${currentBlock.blockNumber}: ${currentState}`)
            // //         this.state = currentState
            // //     }else{
            // //         let closestState = await this.getClosestState(timestamp)
            // //         if(closestState && Object.keys(closestState).length > 0){
            // //             if(closestState.error) return { error:closestState.error }
            // //             console.log('About to save the latest state', closestState)
            // //             this.state = closestState
            // //         }else{
            // //             return { error:'ERROR: Could not save state. State and closest state are empty' }
            // //         }
            // //     }
                
            // // }
            
            let currentStateChanged = await this.database.put({
                key:'currentState',
                value:{
                    state:state || this.state,
                    timestamp:timestamp,
                    blockNumber:currentBlock.blockNumber
                }
            })
            if(currentStateChanged.error) return { error:currentStateChanged }
            else if(currentStateChanged) return currentStateChanged
            // return true
        }catch(e){
            
            return { error:e.message }
        }
    }

    async getCurrentState(){
        try{
            // let closestState = await this.getLatestState()
            // if(closestState){
            //     if(closestState.error) return { error:closestState.error }
            //     console.log('Getting latest state', closestState)
            //     return closestState
            // }else{
            //     return { error:`ERROR: Could not find current state of contract ${this.name} at block ${this.getCurrentBlock().blockNumber}` }
            // }
            let { state } = await this.database.get('currentState');
            let closestState = await this.getLatestState()

        
            if(state){
                if(state.error) return { error:state.error }

                return state
            }else{
                
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

    // async getState(timestamp){
    //     try{
    //         if(typeof number == 'number'){
    //             number = number.toString()
    //         }
    //         console.log('Getting state of ', number)
    //         let { state, blockNumber } = await this.database.get(number);
    //         if(state){
    //             if(state.error) return { error:state.error }
    //             console.log('Has state:', state)
    //             return state
    //         }else{
    //             console.log('Getting closestState')
    //             state = await this.getClosestState(number)
    //             if(state){
    //                 if(state.error) return { error:state.error }
    //                 return state
    //             }else{
    //                 return { error:`ERROR: Could not find state of contract ${this.name} at block number ${number}` }
    //             }
                
    //         }
    //     }catch(e){
    //         return {error:e.message}
    //     }
    // }

    async rollback(blockNumber){
        try{
            // let current = await this.getCurrentState()
            // console.log('Current state', JSON.stringify(current, null, 1))
            // console.log('Rolling back '+this.name+' to state', blockNumber)
            let block = await this.getBlock(blockNumber)
            console.log('Block number', blockNumber)
            let timestamp = block.timestamp;
            console.log('Past timestamp', timestamp)
            let state = await this.getClosestState(timestamp)
            console.log('Past state', JSON.stringify(state, null, 1))
            if(state){
                if(state.error) return { error:state.error }
                this.state = state
                let saved = await this.save(state)
                
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
    async getClosestState(requestedTimestamp){
        try{

            var findClosest = async (value, array)=>{
                let previous = 0
                for await(let item of array){
                  if(item > value && previous <= value){
                    return previous
                  }
  
                  previous = item
                }
  
                return previous
            }
            
            let keys = await this.database.getAllKeys();
                if(keys){

                    let latestTimestamp = await this.getLatestTimestamp()
                    latestTimestamp = parseInt(latestTimestamp)
                    requestedTimestamp = parseInt(requestedTimestamp)
                    let timestamps = await this.parseTimestamps(keys)

                    if(requestedTimestamp >= latestTimestamp){
                        let { state } = await this.database.get(latestTimestamp.toString())
                        if(state.error) return { error:state.error }

                        return state
                    }else{

                        let closestTimestamp = await findClosest(requestedTimestamp, timestamps)
                        if(closestTimestamp){
                            let { state, blockNumber } = await this.database.get(closestTimestamp.toString())
                            if(state.error) return { error:state.error }
                            console.log('Found closest state to blockNumber', blockNumber)
                            return state
                        }else{
                            return { error:'ERROR: Could not find closest to '+requestedTimestamp }
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
                    
                    let latestTimestamp = await this.getLatestTimestamp()
                    let latestState = await this.getClosestState(latestTimestamp.toString())
                    return latestState
                    
                }else{
                    return { error:'ERROR: State storage does not have keys yet' }
                }

        }catch(e){
            return { error:e.message }
        }
        
    }

    async getLatestTimestamp(){
        try{
            let keys = await this.database.getAllKeys();
                if(keys){
                    let highestTimestamp = 0
                    for await(let timestamp of keys){
                        if(timestamp !== 'currentState'){
                            if(parseInt(highestTimestamp) < parseInt(timestamp)){
                                highestTimestamp = timestamp
                            }
                        }
                    }

                    return highestTimestamp
                }else{
                    return { error:'ERROR: State storage does not have keys yet' }
                }
            
        }catch(e){
            return{error:e.message}
        }
    }

    async parseTimestamps(keys){
        try{
            let timestamps = []
            for await(let timestamp of keys){
                if(timestamp !== 'currentState'){
                    timestamps.push(parseInt(timestamp))
                }
            }

            return timestamps
        }catch(e){
            return { error:e.message }
        }
    }

    async getLatestKey(){
        try{
            let keys = await this.database.getAllKeys();
                if(keys){
                    let sortedBlockNumbers = await this.parseTimestamps(keys)
                    return sortedBlockNumbers[sortedBlockNumbers.length - 1]
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