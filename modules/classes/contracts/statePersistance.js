const Database = require('../database/db')
const persistanceDebug = require('debug')('persistance')



class StateStorage{
    constructor({ name, state }){
        if(!name) throw new Error('ERROR: Need to provide a contract name for storage')
        this.state = state || {}
        this.lastChange = 0 //blockNumber
        this.name = name+'Storage'
        this.database = new Database(this.name)
        /**
         * [1000] : { myState:10, yourState:10 }
         * [1003] : { myState:15, yourState:10 }
         * [1008] : { myState:15, yourState:15 }
         */
        this.changeLog = {}  
    }

    debug(...output){
        persistanceDebug(`[${this.name}]`, ...output)
    }

    async init(){
        let stateEntry = await this.database.get(this.name)
        if(!stateEntry) return { error:`ERROR: Could not initiate ${this.name}` }
        if(stateEntry.error) return { error:stateEntry.error }
        let { changeLog, state, lastChange } = stateEntry
        this.changeLog = changeLog
        this.state = state
        this.lastChange = lastChange

        return { started:true }
    }

    async update(state, blockNumber){
        if(state && Object.keys(state).length > 0){
            
            this.state = state
            this.debug('Updating state', state)
            this.changeLog[blockNumber] = state
            this.debug('At block', blockNumber)
            this.lastChange = blockNumber
            this.debug('Last change:', this.lastChange)
        }else{
            this.debug('Updating but no state provided')
            if(this.changeLog[blockNumber]){
                this.debug('Updating but entry exists: overwriting')
                this.changeLog[blockNumber] = this.changeLog[blockNumber]
            }
        }
        return { updated:true }
    }

    async setState(state, blockNumber){
        if(state && Object.keys(state).length > 0){
            this.state = state
            this.changeLog[blockNumber] = state
            this.lastChange = blockNumber
        }
    }

    async lookForClosestState(blockNumber){
        let keys = Object.keys(this.changeLog)
        for await(let key of keys.reverse()){
            if(key <= blockNumber){
                let entry = this.changeLog[key]
                this.debug('Found entry closest to', blockNumber)
                this.debug('Entry:', entry)
                if(entry) return entry
            }
        }
        this.debug('Did not find closest state to ', blockNumber)
        return false
    }

    async lookForClosestKey(blockNumber){
        let keys = Object.keys(this.changeLog)
        this.debug('Looking for key closest to block ', blockNumber)
        for await(let key of keys.reverse()){
            if(key <= blockNumber){
                let entry = this.changeLog[key]
                this.debug('Found key closest to', blockNumber)
                this.debug('Key:', key)
                if(entry) return key
            }
        }
        this.debug('Did not find closest key to ', blockNumber)
        return 0
    }

    async getState(blockNumber=undefined){
        if(blockNumber){
            this.debug('Getting state entry at block', blockNumber)
            let state = this.changeLog[blockNumber]
            if(!state){
                this.debug('Did not find state at block ', blockNumber)
                this.debug('Looking for closest state to ', blockNumber)
                let closestState = await this.lookForClosestState(blockNumber)
                if(!closestState){
                    this.debug('Did not find any state closest to ', blockNumber)
                    return new Error('Did not find any contract state closest to '+blockNumber)
                }else{
                    this.debug('Found closest state to ', blockNumber)
                    return closestState
                }
            }else{
                return state
            }
        }else{
            return this.changeLog[this.lastChange]
        }
    }

    async getLatestState(){
        this.debug('Getting latest state entry at block', this.lastChange)
        this.debug('Entry:', this.changeLog[this.lastChange])
        return this.changeLog[this.lastChange]
    }

    async rollbackBlock(blockNumber){
        this.debug('About to rollback to block', blockNumber)
        let entryKeys = Object.keys(this.changeLog)
        this.debug('Total number of keys', entryKeys.length)
        let shouldDestroy = blockNumber < entryKeys[0]
        this.debug('Should destroy contract?', shouldDestroy)
        if(shouldDestroy){
            return { destroy:true }
        }else{
            let hasEntry = this.changeLog[blockNumber]
            this.debug(`Block ${blockNumber} has state entry?`)
            if(hasEntry){
                this.debug('Found contract state entry at', blockNumber)
                this.state = this.changeLog[blockNumber]
                this.debug('Entry', this.state)
                this.lastChange = blockNumber
            }else{
                this.debug('Did not find contract state entry at', blockNumber)
                let closestKey = await this.lookForClosestKey(blockNumber)
                if(closestKey){
                    this.debug('Closest key', closestKey)
                    this.state = this.changeLog[closestKey]
                    this.lastChange = closestKey
                }else{
                    this.debug('Could not find closest key to ', blockNumber)
                    this.state = this.changeLog[0]
                    this.debug('Setting initial state of contract', this.state)
                    this.lastChange = 0
                }
            }
        }

        for await(let key of entryKeys.reverse()){
            if(key > blockNumber){
                this.debug('Deleting state entry at block', blockNumber)
                delete this.changeLog[key]
            }else{
                break;
            }
        }

        await this.save()
        return this.state

    }

    async save(){
        this.debug('Saving current state')
        let currentStateChanged = await this.database.put({
            key:this.name,
            value:{
                state:this.state,
                changeLog:this.changeLog,
                lastChange:this.lastChange
            }
        })
        this.debug('State entry saved:', {
            state:this.state,
            changeLog:this.changeLog,
            lastChange:this.lastChange
        })
        this.debug('Save successfull:', currentStateChanged)
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
