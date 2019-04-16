const { logger, readFile, writeToFile } = require('./utils')
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
                fs.exists('nodes.json', async (exists)=>{
                    if(exists){
                        let listFile = await readFile('nodes.json');
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
                        logger('WARNING: file does not exist');
                        let saved = writeToFile(this, 'nodes.json');
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
                logger(e);
                reject(e)
            }
        })
        
        
    }

    saveNodeList(){
        try{
            let saved = writeToFile(this, 'nodes.json');
            if(saved){
                logger('Saved list of know nodes');
            }
        }catch(e){
            logger(e)
        }
    }
}


const t = async ()=>{
    let myList = new NodeList();
    myList.addNewAddress('bruno')
    let added = await myList.loadNodeList();
    if(added){
        console.log(myList)
    }
}

module.exports = NodeList;
