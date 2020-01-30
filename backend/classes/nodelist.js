const { logger, readFile, writeToFile } = require('../tools/utils')
const fs = require('fs')

class NodeList{
    constructor(addresses=[], contacts={}, blackListed=[]){
        this.addresses = addresses;
        this.contacts = contacts
        this.blackListed = blackListed;
        this.filename = './databases/nodelist.json'
    }

    addNewAddress(address){
        if(address){
            if(!this.addresses.includes(address)){
                this.addresses.push(address)
            }else{
                return false;
            }
        }else{
            logger('ERROR: address to add is undefined');
        }
       
    }

    addToBlackList(address){
        if(address){
            if(!this.blackListed.includes(address)){
                this.blackListed.push(address)
            }else{
                return false;
            }
        }else{
            logger('ERROR: address to add is undefined');
        }
    }

    async loadNodeList(){
        return new Promise((resolve, reject)=>{
            try{
                fs.exists('./data/nodelist.json', async (exists)=>{
                    if(exists){
                        let listFile = await readFile(this.filename);
                        let list = JSON.parse(listFile)
                        if(list){
                            list.addresses.forEach((addr)=>{
                                this.addNewAddress(addr)
                                
                            })
                            list.blackListed.forEach((addr)=>{
                                this.addToBlackList(addr)
                            })
                            resolve(true)
                        }else{
                            resolve(false);
                        }
                    }else{
                        
                        let saved = writeToFile(this, this.filename);
                        if(saved){
                            logger('Created new list of known nodes')
                            resolve(true)
                        }else{
                            logger('ERROR: could not create list of nodes')
                            resolve(false)
                        }
                    }
                    
                })
                
            }catch(e){
                console.log(e);
                reject(e)
            }
        })
        
        
    }

    saveNodeList(){
        return new Promise(async (resolve, reject)=>{
            try{
                let saved = await writeToFile(this, this.filename);
                if(saved){
                    logger('Saved list of known nodes');
                    resolve(true)
                }
            }catch(e){
                reject(e)
            }
        })
        
    }
}

module.exports = NodeList;
