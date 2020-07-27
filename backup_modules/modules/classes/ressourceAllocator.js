const Database = require('./database')
const { isValidAccountJSON } = require('../tools/jsonvalidator')

class RessourceAllocator{
    constructor(opts){
        this.memAllocationsDB = new Database('./data/memAllocationsDB')
        this.cpuTimeAllocationsDB = new Database('./data/cpuTimeAllocationsDB')
        this.stakesDB = opts.stakesDB
    }

    async getAvailableMemory(accountName){
        if(!accountName) return { error:'ALLOCATION ERROR: Account name is required' }
        let availableResources = await this.memAllocationsDB.get(accountName)
        if(!availableResources) return false
        else if(availableResources.error) return { error:availableResources.error }
        else{
            let memoryStats = availableResources.memory
            return memoryStats.memoryAvailable
            
        }
        
    }

    async getMemoryStats(accountName){
        if(!accountName) return { error:'ALLOCATION ERROR: Account name is required' }
        let availableResources = await this.memAllocationsDB.get(accountName)
        if(!availableResources) return false
        else if(availableResources.error) return { error:availableResources.error }
        else{
            return availableResources.memory
        }
        
    }

    async getFullStats(accountName){
        if(!accountName) return { error:'ALLOCATION ERROR: Account name is required' }
        let cpuTimeStats = await this.cpuTimeAllocationsDB.get(accountName)
        if(cpuTimeStats.error) return { error:cpuTimeStats.error }
        
        let memoryStats = await this.memAllocationsDB.get(accountName)
        if(memoryStats.error) return { error:memoryStats.error }

        return {
            memory:memoryStats,
            cpuTime:cpuTimeStats
        }
    }

    async buyMemory({ amount, account, transaction }){
        // if(!isValidAccountJSON(account)) return { error: 'ALLOCATION ERROR: Need to provide valid account'}
        if(!amount || typeof amount !== 'number' || amount <= 0)  return { error:'ALLOCATION ERROR: amount of memory needs to be above zero' }

        let previousResourceAllocations = await this.memAllocationsDB.get(account.name)
        if(previousResourceAllocations && previousResourceAllocations.memory){
            if(previousResourceAllocations.error) return { error:previousResourceAllocations.error }
            else{

                let memoryStats = previousResourceAllocations.memory
                let memoryAvailable = memoryStats.memoryAvailable
                let previousHistory = memoryStats.history

                let memoryAllocated = await this.memAllocationsDB.put({
                    id:account.name,
                    key:'memory',
                    value:{
                        memoryAvailable:memoryAvailable + amount,
                        account:account.name,
                        history:[ ...previousHistory, transaction]
                    }
                })

                if(memoryAllocated.error) return { error:memoryAllocated.error }
                else return memoryAllocated
            } 
        }else{
            let memoryAllocated = await this.memAllocationsDB.put({
                id:account.name,
                key:'memory',
                value:{
                    memoryAvailable:amount,
                    account:account.name,
                    history:[transaction]
                }
            })

            if(memoryAllocated.error) return { error:memoryAllocated.error }
            else return memoryAllocated
        }

        

    }

    async buyCpuTime({ amount, account, transaction }){
        // if(!isValidAccountJSON(account)) return { error: 'ALLOCATION ERROR: Need to provide valid account'}
        if(!amount || typeof amount !== 'number' || amount <= 0)  return { error:'ALLOCATION ERROR: amount of memory needs to be above zero' }

        let previousResourceAllocations = await this.cpuTimeAllocationsDB.get(account.name)
        if(previousResourceAllocations && previousResourceAllocations.cpuTime){
            
            if(previousResourceAllocations.error) return { error:previousResourceAllocations.error }
            else{

                let cpuTimeStats = previousResourceAllocations.cpuTime
                let cpuTimeAvailable = cpuTimeStats.cpuTimeAvailable
                let previousHistory = cpuTimeStats.history

                let cpuTimeAllocated = await this.cpuTimeAllocationsDB.put({
                    id:account.name,
                    key:'cpuTime',
                    value:{
                        cpuTimeAvailable:cpuTimeAvailable + amount,
                        account:account.name,
                        history:[ ...previousHistory, transaction]
                    }
                })

                if(cpuTimeAllocated.error) return { error:cpuTimeAllocated.error }
                else return cpuTimeAllocated
            } 
        }else{
            let cpuTimeAllocated = await this.cpuTimeAllocationsDB.put({
                id:account.name,
                key:'cpuTime',
                value:{
                    cpuTimeAvailable:amount,
                    account:account.name,
                    history:[transaction]
                }
            })

            if(cpuTimeAllocated.error) return { error:cpuTimeAllocated.error }
            else return cpuTimeAllocated
        }
    }

}


const run = async () =>{
    let account = { name:'jeff' }
    let tx = { hash:'thisIsAHash' }
    let alloc = new RessourceAllocator({})
    let allocated = await alloc.buyCpuTime({
        amount:100,
        account:account,
        transaction:tx
    })
    console.log(allocated)
    console.log(await alloc.getFullStats(account.name))
}
run()
// module.exports = RessourceAllocator