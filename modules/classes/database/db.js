const store = require('rocket-store')
const genesis = require('../../tools/getGenesis')

class Database{
    constructor(dbName, options){
        this.database = store;
        this.name = dbName;
        this.configSet = null;
        this.options = options
        this.dataFolder = (process.NETWORK && process.NETWORK !== '' ? "./data/"+process.NETWORK+"/" : "./data/mainnet/")
    }

    async init(){
        try{
            if(!this.options){
                
                await this.database.options({
                    data_storage_area :this.dataFolder,
                    data_format       : this.database._FORMAT_JSON,
                });
            }else{
                let defaultOptions = {
                    data_storage_area :this.dataFolder,
                    data_format       : this.database._FORMAT_JSON,
                }
                let options = { ...defaultOptions, ...options }
                await this.database.options(options);
            }
            
            return true
        }catch(e){
            return { error:e }
        }
        
    }

    async put({ id, key, value }){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
            if(!key) return {error:"Cannot put to Database: key is undefined"}
            if(!value) return {error:"Cannot put to Database: value is undefined"}
    
            let written = await this.database.post(this.name, key, value)
            return written
        }catch(e){
            return {error:e.message}
        }
        
    }

    async add(entry){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
            if(!entry._id && entry.id) entry._id == entry.id
            if(!entry._id && !entry.id) return {error:"Cannot add to Database: Id is undefined"}
            else{
                
                let written = await this.database.post(this.name, entry._id, entry)
                
                return written
            }
            
        }catch(e){
            console.log(e)
            return {error:e.message}
        }
        
    }

    async get(key){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
            if(!key) return {error:"Cannot read to Database: Id is undefined"}
    
            let entry = await this.database.get(this.name, key);
            
            let results = entry.result
            if(Array.isArray(results) && results.length > 0) return results[0]
            else return false
        }catch(e){
            return {error:e.message}
        }

       
    }

    async getAll(){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
            
            let entry = await this.database.get(this.name, '*');
            let results = entry.result
    
           
            if(Array.isArray(results) && results.length > 0){
                return results
            }else{
                return []
            }
        }catch(e){
            return {error:e.message}
        }
        

    }

    async getAllKeys(){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
            
            let entry = await this.database.get(this.name, '*');
            let container = {}
            let results = entry.key
    
           
            if(Array.isArray(results) && results.length > 0){
                return results
            }else{
                return []
            }
        }catch(e){
            return {error:e.message}
        }
        

    }

    async delete(entry){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
            
            if(!entry) return {error:"Cannot read to Database: entry is undefined"}
            else if(!entry.id && !entry._id) return { error:`Entry does not have an id` }
            let deleted = await this.database.delete(this.name, entry._id || entry.id)
            return deleted
        }catch(e){
            return {error:e.message}
        }
    }

    async deleteId(id){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
            if(!id) return { error:'ERROR: Could not delete because ID is undefined' }
            else {
                let deleted = await this.database.delete(this.name, id)
                return deleted
            }
        }catch(e){
            return {error:e.message}
        }
    }

    async destroy(){
        try{
            if(!this.configSet){
                this.configSet = await this.init()
                if(this.configSet.error) return {error:this.configSet.error}
            }
    
            let deleted = await this.database.delete(this.name)
            return deleted
        }catch(e){
            return {error:e.message}
        }
    }


}

module.exports = Database