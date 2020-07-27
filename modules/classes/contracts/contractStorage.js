const Database = require('../database/db')

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
            let currentBlock = await this.getCurrentBlock();
            let timestamp = currentBlock.timestamp
            
            if(state && Object.keys(state).length > 0) this.state = state;
            
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
            else{
                let updatedIndex = await this.updateIndex()
                if(updatedIndex.error) return { error:updatedIndex.error }
                else return added
            }
        }else{
            console.log('State provided:', state)
            return { error:`ERROR: Cannot update state of ${this.name} with empty entry` }
        }
        
    }
    //[ {b,t},{b,t},{b,t}_________{b,t} ]
    async updateIndex(){
        let currentBlock = await this.getCurrentBlock()
        let indexEntry = await this.database.get('index')
        let index = []
        if(!indexEntry){
            index = [{
                blockNumber:currentBlock.blockNumber,
                timestamp:currentBlock.timestamp,
            }]
        }else{
            index = indexEntry.index
            index = [...index, {
                blockNumber:currentBlock.blockNumber,
                timestamp:currentBlock.timestamp,
            }]
        }
        let updated = await this.database.put({
            key:'index',
            value:{
                index:index   //Current block is pointing towards the previousblock                                                                
            }
        })
        if(updated.error) return { error:updated.error }
        else return updated
    }
    
    async saveIndex(index){
        if(!index || index.length === 0) return { error:"ERROR: Cannot save empty index" }
        let updated = await this.database.put({
            key:'index',
            value:{
                index:index   //Current block is pointing towards the previousblock                                                                
            }
        })
        if(updated.error) return { error:updated.error }
        else return updated
    }

    async save(state = undefined){
        try{
            
            let currentBlock = await this.getCurrentBlock()
            let timestamp = currentBlock.timestamp
            if(state && Object.keys(state).length > 0){
                this.state = state
            }
            
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
            
        }catch(e){
            
            return { error:e.message }
        }
    }

    async getCurrentState(){
        try{
            let closestState = await this.getLatestState()
            if(closestState){
                if(closestState.error) return { error:closestState.error }
                return closestState
            }else{
                return { error:`ERROR: Could not find current state of contract ${this.name} at block ${await this.getCurrentBlock().blockNumber}` }
            }
        }catch(e){
            return {error:e.message}
        }
    }

    async findClosestIndexEntry(blockNumber){
        let { index } = await this.database.get('index')
        let position = 0
        for await(let entry of index){
            let nextEntry = index[position + 1]
            if(nextEntry){
                if(entry.blockNumber <= blockNumber && nextEntry.blockNumber > blockNumber){
                    return entry
                }
            }else{
                return entry
            }
            position++
        }
    }
    //Remove all entries before blockNumber, including the one at blocknumber
    async rollbackIndex(blockNumber){
        let { index } = await this.database.get('index')
        let position = 0
        
        for await(let entry of index){
            let nextEntry = index[position + 1]
            if(nextEntry){
                if(entry.blockNumber <= blockNumber && nextEntry.blockNumber > blockNumber){
                    break
                }
            }
            position++
        }
        console.log("Index length before slice", index.length)
        let rolledBackIndex = index.slice(0, position - 1)
        console.log("Index length after slice", rolledBackIndex.length)
        
        let savedIndex = await this.saveIndex(rolledBackIndex)
        if(savedIndex.error) return { error:savedIndex.error }
        else savedIndex
        console.log('Saved index', savedIndex)
        
    }

    async rollback(blockNumber){
        try{
            
            console.log('Rolling back '+this.name+' to state', blockNumber)
            let closestEntry = await this.findClosestIndexEntry(blockNumber)
            if(closestEntry.error) return { error:closestEntry.error }
            console.log('Closest Entry', closestEntry)
            let { state } = await this.database.get(closestEntry.timestamp)
            
            console.log('Past state', JSON.stringify(state, null, 1))
            if(state){
                if(state.error) return { error:state.error }
                
                let updatedIndex = await this.rollbackIndex(blockNumber)
                if(updatedIndex.error) return { error:updatedIndex.error }
                console.log('Updated index',updatedIndex)
                
                this.state = state
                let saved = await this.update(state)
                
                if(saved.error) return { error:saved.error }
                else return saved
                //return state
            }else{
                return { error:'ERROR Could not find state at block' }
                //means state does not exist beyond this blocknumber
            }
            
            
        }catch(e){
            return { error:e.message }
        }
        
    }

    // async testRollback(blockNumber){
    //     try{
    //         // let current = await this.getCurrentState()
    //         // console.log('Current state', JSON.stringify(current, null, 1))
    //         // console.log('Rolling back '+this.name+' to state', blockNumber)
    //         let block = await this.getBlock(blockNumber)
    //         console.log('Block number', blockNumber)
    //         let timestamp = block.timestamp;
    //         console.log('Past timestamp', timestamp)
    //         let state = await this.getClosestState(timestamp)
    //         console.log('Past state', JSON.stringify(state, null, 1))
    //         if(state){
    //             if(state.error) return { error:state.error }
    //             else return state
    //         }else{
    //             return { error:'ERROR Could not find state at block' }
    //             //means state does not exist beyond this blocknumber
    //         }
            
            
    //     }catch(e){
    //         return { error:e.message }
    //     }
        
    // }
    
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

                        let { state, blockNumber } = await this.database.get(requestedTimestamp);
                        if(state && Object.keys(state).length && !state.error){
                            console.log('Found exact timestamp', requestedTimestamp, ' at block ', blockNumber)
                            
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
                    }

                    
                }else{
                    return { error:'ERROR: State storage does not have keys yet' }
                }

        }catch(e){
            return { error:e.message }
        }
        
    }

    async rollbackToBlock(blockNumber, latestBlock=false){
        let block = await this.getBlock(blockNumber)
        if(!block && latestBlock){
            block = latestBlock
        }else if(!block && latestBlock){
            return { error:'ERROR: Could not find block '+blockNumber+' during rollback' }
        }
        let timestampString = block.timestamp
        let targetTimestamp = parseInt(timestampString)
        let keys = await this.database.getAllKeys()
        let parsedKeys = await this.parseTimestamps(keys)

        for await(let timestamp of parsedKeys){
            if(timestamp > targetTimestamp){
                let entry = await this.database.get(timestamp.toString())
                if(!entry) console.log({ error:`ERROR: Could not locate state entry ${timestamp}` })
                else if(entry.error) return { error:entry.error }

                if(entry && !entry.error){
                    let deleted = await this.database.deleteId(timestamp.toString())
                    if(deleted.error) console.log(deleted.error)
                }
                

            }
        }
        let latestState = await this.getLatestState()
        return latestState

    }

    

    async getLatestState(){
        try{
            let keys = await this.database.getAllKeys();
                if(keys){
                    
                    let latestTimestamp = await this.getLatestTimestamp()
                    let latestState = await this.getClosestState(latestTimestamp.toString())
                    if(latestState.error) return { error:latestState.error }
                    else return latestState
                    
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
