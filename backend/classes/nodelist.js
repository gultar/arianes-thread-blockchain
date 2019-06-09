const { logger, readFile, writeToFile } = require('../tools/utils')
const fs = require('fs')

class NodeList{
    constructor(addresses=[], blackListed=[]){
        this.addresses = addresses;
        this.blackListed = blackListed;
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
                fs.exists('./data/peers.json', async (exists)=>{
                    if(exists){
                        let listFile = await readFile('./data/peers.json');
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
                        
                        let saved = writeToFile(this, './data/peers.json');
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
        return new Promise((resolve, reject)=>{
            try{
                let saved = writeToFile(this, './data/peers.json');
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
