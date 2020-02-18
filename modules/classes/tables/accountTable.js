const ECDSA = require('ecdsa-secp256r1');
const { logger, readFile, writeToFile } = require('../../tools/utils.js') 
const { isValidActionJSON } = require('../../tools/jsonvalidator')
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

      getKeyOfAccount(name){
          return new Promise(async (resolve)=>{
              let accountEntry = await this.accountsDB.get(name)
              if(accountEntry){
                if(accountEntry.error) resolve({error:accountEntry.error})
                else{
                    let account = accountEntry.account;
                    resolve(account.ownerKey)
                }
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
      deleteAccount({ name, action }, ){
          return new Promise(async(resolve, reject)=>{
            try{
                if(name && action && isValidActionJSON(action)){
                    let account = await this.getAccount(name)
                    if(account){
                        if(account.error) resolve({error:account.error})
                        const publicKey = ECDSA.fromCompressedPublicKey(account.ownerKey);
                        let isOwner = await publicKey.verify(action.hash, action.signature);
                        if(isOwner){
                            let deleted = await this.accountsDB.deleteId(account.name)
                            if(deleted.error) resolve({error:deleted.error})
                            else resolve(deleted)
                        }else{
                            resolve({ error:`ERROR: Could not delete ${name}` })
                        }
                    }else{
                        resolve({error:'ERROR: Could not retrieve account ${name}'})
                    }
                }else{
                    resolve({error:'ERROR: Need to provide account name and signature'})
                }
                
            }catch(e){
                resolve({error:e.message})
            }
            
          })
      }


    
}

module.exports = AccountTable;