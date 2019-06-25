const ECDSA = require('ecdsa-secp256r1');
const { logger, readFile, writeToFile } = require('../tools/utils.js') 

class AccountTable{
    constructor(accounts={}){
        this.accounts = accounts;
    }

    addAccount(account){
        return new Promise((resolve, reject)=>{
            if(!this.accounts[account.name]){
                this.accounts[account.name] = account;
                resolve(true)
            }else{
                resolve(false)
            }
        })
      }

    //   loadAllAccountsFromFile(){
    //    return new Promise(async (resolve, reject)=>{
    //     try{
    //         let accountsFile = await readFile('./data/accounts.json');
    //         if(accountsFile){
    //             let accounts = JSON.parse(accountsFile);
    //             if(accounts){
    //                 this.accounts = accounts;
    //                 resolve(true)
    //             }else{
    //                 resolve(false)
    //             }
    //         }else{
    //             resolve(false)
    //         }
    //     }catch(e){
    //         console.log(e)
    //         resolve(false)
    //     }
    //    })
    //   }

      getAccount(name){
        if(this.accounts){
            return this.accounts[name];
        }
      }

      getAccountsOfKey(key){
        let accountNames = Object.keys(this.accounts);
        let accounts = {};
        accountNames.forEach( name =>{
            if(this.accounts[name].ownerKey == key){
                accounts[name] = this.accounts[name];
            }
        })

        return accounts
      }

      deleteAccount(name, signature){
          return new Promise(async(resolve, reject)=>{
            try{
                if(name && signature && typeof signature == 'string'){
                    if(this.accounts[name]){
                        let account = this.accounts[name];
                        const publicKey = ECDSA.fromCompressedPublicKey(account.ownerKey);
                        let isOwner = await publicKey.verify(account.hash, signature);
                        if(isOwner){
                            delete this.accounts[name];
                            resolve(true)
                        }else{
                            resolve(false)
                        }
                    }else{
                        resolve(false)
                    }
                }else{
                    resolve(false)
                }
                
            }catch(e){
                console.log(e)
            }
            
          })
      }

      loadAllAccountsFromFile(){
        return new Promise(async (resolve, reject)=>{
         try{
             fs.exists('./data/accounts.json', async (exists)=>{
                 if(exists){
                    let accountsFile = await readFile('./data/accounts.json');
                    if(accountsFile){
                        let accounts = JSON.parse(accountsFile);
                        if(accounts){
                            this.accounts = accounts;
                            resolve(true)
                        }else{
                            resolve(false)
                        }
                    }else{
                        resolve(false)
                    }
                 }else{
                    let saved = await this.saveTable()
                    resolve(saved)
                 }
                
             })
            
         }catch(e){
             console.log(e)
             resolve(false)
         }
        })
       }

      saveTable(){
          return new Promise((resolve, reject)=>{
            try{
                let saved = writeToFile(this.accounts, './data/accounts.json');
                if(saved){
                    logger('Saved account table');
                    resolve(true)
                }
            }catch(e){
                reject(e)
            }
          })
        
      }

      executeAction(action){
        //implement
      }
}

module.exports = AccountTable;