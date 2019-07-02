const { isValidAccountJSON } = require('../../tools/jsonvalidator')
const Account = require('../../classes/account')
class Permissions{
    constructor(owner){
        //Owner - Account can do anything from modifying contract state directly to deleting it
        //Modify - Account can read/write and add new permissions
        //Write - Account can modify contract state with actions
        //Read - By default, everyone can read data from the contract
        this.levels = ['owner','modify', 'write', 'read', ]
        this.accounts = {
            [owner.name]:{
                account:owner,
                level:'owner'
            }
        }
    }

    defineMultipleAccounts(accountPermissionPairs){
        return new Promise((resolve)=>{
            if(accountPermissionPairs && Array.isArray(accountPermissionPairs)){
                accountPermissionPairs.forEach( pair=>{
                    let level = pair.level
                    let account = pair.account
                    if(level && account){
                        let permissionSet = this.define(account, level)
                        if(permissionSet.error) {
                            return { 
                                error: {
                                    message:permissionSet.error,
                                    account:account, 
                                    level:level
                                }  
                            }
                        }

                    }else{
                        resolve({ error: 'PERMISSIONS ERROR: Invalid account/permission pair' }) 
                    }
                    
                })
    
                resolve(true)
            }
        })
        
    }

    define(account, level){
        if(account && level){
            if(this.levels.includes(level)){
                this.accounts[account.name] = {
                    account:account,
                    level:level
                }
                return true;
            }else{
                return { error:'PERMISSION ERROR: Invalid permission level' }
            }
        }else{
            return { error: 'PERMISSION ERROR: Invalid account structure' }
        }
        
        // if(isValidAccountJSON(account)){
            
        // }else{
        //     
        // }
    }

}

module.exports = Permissions

// let myPermissions = new Permissions("I'm the owner of this, bitch")
// let account1 = new Account('poubelle', 'key')
// let account2 = new Account('garbage', 'clé')
// let account3 = new Account('jupette', 'toupette')
// let account4 = new Account('kopek', 'rouble')
// let account5 = new Account('mongole', 'cheval')
// let addedFirst = myPermissions.define(account1, 'write')


// if(addedFirst.error) console.log(addedFirst)
// let addedSecond = myPermissions.define(account2, 'modify')
// if(addedSecond.error) console.log(addedSecond)
// myPermissions.defineMultipleAccounts([
//     {
//         account:account3, 
//         level:'write'
//     },
//     {
//         account:account4, level:'modify'
//     },
//     {
//         account:account5, level:'write'
//     }
// ])
