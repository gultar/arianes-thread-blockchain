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
        let log = await this.database.get(this.name)
        if(!log) return { error:`ERROR: Could not initiate ${this.name}` }
        if(log.error) return { error:log.error }

        this.changeLog = log
        let numberOfEntries = Object.keys(this.changeLog).length
        let entryKeys = Object.keys(this.changeLog)
        let lastState = this.changeLog[entryKeys[numberOfEntries - 1]]

        this.state = lastState
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
        console.log('State updated', JSON.stringify(this.state, null, 2))
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
            if(state.atBlock) return await this.getState(state.atBlock)
            else return state
        }else{
            return this.changeLog[this.lastChange]
        }
    }

    async getLatestState(){
        return await this.getState(this.lastChange)
    }

    async rollbackBlock(blockNumber){
        let entryKeys = Object.keys(this.changeLog)
        let firstEntry = entryKeys[0]
        let isBeginning = blockNumber <= firstEntry
        if(isBeginning){
            this.state = {}
            
        }else{
            let previousState = this.changeLog[blockNumber]
            let position = blockNumber
            if(previousState.atBlock){
                this.lastChange = previousState.atBlock
                position = previousState.atBlock
                previousState = this.changeLog[previousState.atBlock]
            }

            this.state = previousState
            let entryKeys = Object.keys(this.changeLog)
            let entriesToDelete = entryKeys.slice(position, entryKeys.length - 1)
            for await(let entry of entriesToDelete){
                console.log('Need to delete', entry)
                delete this.changeLog[entry]
            }

            // this.save()
        }
        return this.state

    }

    async save(){
        let currentStateChanged = await this.database.put({
            key:this.name,
            value:this.changeLog
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
