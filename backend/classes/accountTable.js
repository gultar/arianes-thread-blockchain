const ECDSA = require('ecdsa-secp256r1');
const { logger, readFile, writeToFile } = require('../tools/utils.js') 
const fs = require('fs')
const Database = require('./database')

class AccountTable{
    constructor(){
        this.accounts = {}
        this.accountsDB = new Database('./data/accountsDB')
    }

    

    addAccount(account){
        return new Promise(async (resolve)=>{
            let existing = await this.accountsDB.get(account.name)
            if(!existing){
                let added = this.accountsDB.add({
                    _id:account.name,
                    account:account
                })
                resolve(added)
            }else{
                if(existing.error) resolve({error:existing.error})
                resolve({error:'ERROR: Account already exists'})
            }
        })
      }

      getAccount(name){
          return new Promise(async (resolve)=>{
            let accountEntry = await this.accountsDB.get(name)
            if(accountEntry){
                if(accountEntry.error){
                    logger(accountEntry.error)
                    resolve(false)
                }
                resolve(accountEntry.account)
            }else{
                resolve(false)
            }
          })
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

      //Deprecated
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

      //Deprecated
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

       //Deprecated
      saveTable(silent=false){
          return new Promise((resolve, reject)=>{
            try{
                let saved = writeToFile(this.accounts, './data/accounts.json');
                if(saved){
                    if(!silent) logger('Saved account table');
                    resolve(true)
                }else{
                    logger('ERROR: Could not save account table')
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