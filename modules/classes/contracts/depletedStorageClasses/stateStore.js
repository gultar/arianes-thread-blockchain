const Database = require('../database/db')

class StateStorage{
    constructor({ name, state }){
        if(!name) throw new Error('ERROR: Need to provide a contract name for storage')
        this.state = state || {}
        this.lastChange = 0 //blockNumber
        this.name = name+'Storage'
        this.database = new Database(this.name)
        /**
         * [1000] : { myState:10, yourState:10 }
         * [1001] : { atBlock: 1000 }
         * [1002] : { atBlock: 1000 }
         * [1003] : { myState:15, yourState:10 }
         * [1004] : { atBlock: 1003 }
         * [1005] : { atBlock: 1003 }
         * [1006] : { atBlock: 1003 }
         * [1007] : { atBlock: 1003 }
         * [1008] : { myState:15, yourState:15 }
         */
        this.changeLog = {}  
    }

    async init(){
        let stateEntry = await this.database.get(this.name)
        if(!stateEntry) return { error:`ERROR: Could not initiate ${this.name}` }
        if(stateEntry.error) return { error:stateEntry.error }
        let { changeLog, state, lastChange } = stateEntry
        this.changeLog = changeLog
        this.state = state
        this.lastChange = lastChange

        console.log('State Entry', stateEntry)

        return { started:true }
    }

    async update(state, blockNumber){
        if(state && Object.keys(state).length > 0){
            this.state = state
            this.changeLog[blockNumber] = state
            this.lastChange = blockNumber
        }else{
            if(this.changeLog[blockNumber]){
                this.changeLog[blockNumber] = this.changeLog[blockNumber]
            }else{
                this.changeLog[blockNumber] = { atBlock:this.lastChange }
            }
        }
        // console.log('State updated', JSON.stringify(this.state, null, 2))
        return { updated:true }
    }

    async setState(state, blockNumber){
        if(state && Object.keys(state).length > 0){
            this.state = state
            this.changeLog[blockNumber] = state
            this.lastChange = blockNumber
        }else{
            this.changeLog[blockNumber] = { atBlock:this.lastChange }
        }
    }

    async getState(blockNumber=undefined){
        if(blockNumber){
            let state = this.changeLog[blockNumber]
            if(!state){
                return this.changeLog[this.lastChange]
            }else{
                if(state.atBlock) return await this.getState(state.atBlock)
                else return state
            }
        }else{
            return this.changeLog[this.lastChange]
        }
    }

    async getLatestState(){
        return this.changeLog[this.lastChange]
    }

    async rollbackOneState(){
        let entryKeys = Object.keys(this.changeLog)
        
        let isBeginning = entryKeys.length <= 1

        if(isBeginning){
            this.state = {}
        }else{
            let lastStateKey = entryKeys.pop()
            console.log('Last state key', lastStateKey)
            let lastState = this.changeLog[lastStateKey]
            if(lastState.atBlock){
                console.log('Is pointing to other change')
                delete this.changeLog[lastStateKey]
            }else{
                delete this.changeLog[lastStateKey]
                let previousKey = entryKeys[entryKeys.length - 1]
                console.log('Previous Block', previousKey)
                let previousState = this.changeLog[previousKey]
                this.lastChange = previousKey
                if(previousState.atBlock){
                    this.lastChange = previousState.atBlock
                    console.log('Pointed to other change', previousState)
                    previousState = this.changeLog[previousState.atBlock]
                    
                }
    
                this.state = previousState
            }

            
        }
        await this.save()
        return this.state

    }

    async rollbackBlock(blockNumber){
        let entries = Object.keys(this.changeLog)
        let numberOfBlocksToRemove = this.lastChange - blockNumber
        let counter = 0
        for await(let entry of entries.reverse()){
            if(counter == numberOfBlocksToRemove) break;
            if(entry <= blockNumber) break;
            else {
                let rolledBack = await this.rollbackOneState()
                if(rolledBack.error){
                    console.log('Caught an error', rolledBack)
                    return { error:rolledBack.error }
                }
            }
            counter++
        }

        return this.state
    }

    // async rollbackBlock(blockNumber){
    //     let entryKeys = Object.keys(this.changeLog)
    //     console.log('Num of entry keys:', entryKeys)
    //     let firstEntry = entryKeys[0]
    //     console.log('First key', firstEntry)
    //     let isBeginning = blockNumber <= firstEntry
    //     if(isBeginning){
    //         this.state = {}
    //     }else{
    //         console.log('Block number', blockNumber)
    //         let previousState = this.changeLog[blockNumber]
    //         console.log('Previous State',previousState)
    //         let position = blockNumber
    //         if(previousState.atBlock){
    //             this.lastChange = previousState.atBlock
    //             position = previousState.atBlock
    //             previousState = this.changeLog[previousState.atBlock]
    //         }

    //         this.state = previousState
    //         let entryKeys = Object.keys(this.changeLog)
    //         let entriesToDelete = entryKeys.slice(position, entryKeys.length)
    //         for await(let entry of entriesToDelete.reverse()){
    //             console.log('Need to delete', entry)
    //             delete this.changeLog[entry]
    //         }

    //         // this.save()
    //     }
    //     return this.state

    // }

    async save(){
        let currentStateChanged = await this.database.put({
            key:this.name,
            value:{
                state:this.state,
                changeLog:this.changeLog,
                lastChange:this.lastChange
            }
        })
        if(currentStateChanged.error) return { error:currentStateChanged }
        else if(currentStateChanged) return currentStateChanged
    }

    async destroyStorage(){
        let deleted = await this.database.destroy()
        if(deleted.error) return { error:deleted.error }
        else return deleted
    }

    
}

module.exports = StateStorage
