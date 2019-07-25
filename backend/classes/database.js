const PouchDB = require('pouchdb')
const Validator = require('jsonschema').Validator;

class Database{
    constructor(path){
        this.database = new PouchDB(path)
    }

    get(id){
        return new Promise(async (resolve)=>{
            if(id){
                this.database.get(id)
                  .then((result)=>{
                    resolve(result)
                  })
                  .catch(e => {
                    resolve(false)
                  })
            }else{
                resolve({error:"Cannot get from Database: Id is undefined"})
            }
        })
      }

      put(entry){
        return new Promise(async (resolve)=>{
            if(!entry) resolve({error:'Cannot put to Database: object to put is undefined'})

            let { id, key, value } = entry

            if(!id) resolve({error:"Cannot put to Database: Id is undefined"})
            if(!key) resolve({error:"Cannot put to Database: key is undefined"})
            if(!value) resolve({error:"Cannot put to Database: value is undefined"})

            let exists = await this.get(id)
            if(exists){
                if(exists.error) resolve({error:exists.error})
                let deleted = await this.delete(exists)
                if(deleted){
                    if(deleted.error) resolve({error:deleted.error})
                    this.database.put({
                        _id:id,
                        [key]:value
                    })
                    .then((okay)=>{
                        resolve(okay)
                    })
                    .catch(e => {
                        resolve({error:e})
                    })
                }else{
                    resolve({error:`Could not delete entry of id ${id}`})
                }
                

            }else{
                this.database.put({
                    _id:id,
                    [key]:value
                })
                .then((okay)=>{
                    resolve(okay)
                })
                .catch(e => {
                    resolve({error:e})
                })
            }

            
        })
      }

      delete(dbEntry){
        return new Promise((resolve)=>{
            if(!this.isValidDBEntry(dbEntry)) resolve({error: "Db entry to delete is of invalid format"})
            this.database.remove(dbEntry._id, dbEntry._rev)
            .then((deleted)=>{
               resolve(deleted)
            })
            .catch(e => {
               resolve({error:e})
            })
        })
      }

      isValidDBEntry(dbEntry){
        var v = new Validator();
        
        var schema = {
            "id":"/dbEntry",
            "type": "object",
            "properties": {
                "_id": {"type": "string"},
                "_rev": {"type": "string"},
            },
            "required": ["_id", "_rev"]
        };

        if(dbEntry){
            v.addSchema(schema, "/dbEntry")
            let valid = v.validate(dbEntry, schema);
            if(valid.errors.length == 0){
                return true
            }else{
                console.log(valid.errors)
                return false;
            }
            
        }
      }
}

module.exports = Database;