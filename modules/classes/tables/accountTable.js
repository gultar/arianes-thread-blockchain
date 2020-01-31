const ECDSA = require('ecdsa-secp256r1');
const { logger, readFile, writeToFile } = require('../../tools/utils.js') 
const fs = require('fs')
// const Database = require('./database')
const Database = require('../database/db')
class AccountTable{
    constructor(){
        this.accounts = {}
        // this.accountsDB = new Database('./data/accountsDB')
        this.accountsDB = new Database('accounts')
    }

    addAccount(account){
        return new Promise(async (resolve)=>{
            let existing = await this.accountsDB.get(account.name)
            if(!existing){
                
                let added = await this.accountsDB.add({
                    _id:account.name,
                    account:account,
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
        return new Promise(async(resolve)=>{
            let foundAccounts = []
            let allAccounts = await this.accountsDB.getAll()
            

            for(let row of allAccounts){
                let account = row.account
                if(account){
                    if(account.ownerKey == key){
                        foundAccounts.push(account)
                    }
                }else{
                    logger('ERROR', `No entry for account ${id}`)
                }
            }

            resolve(foundAccounts)
        })
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


    
}

module.exports = AccountTable;