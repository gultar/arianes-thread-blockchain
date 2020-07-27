const { isValidAccountJSON } = require('../../../tools/jsonvalidator')
const Account = require('../../accounts/account')
class Permissions{
    constructor(owner){
        //Owner - Account can do anything from modifying contract state directly to deleting it
        //Modify - Account can read/write and add new permissions
        //Write - Account can modify contract state with actions
        //Read - By default, everyone can read data from the contract
        this.category = ['owner','modify', 'write', 'read', ]
        this.level = {
            'owner':4,'modify':3, 'write':2, 'read':1,
        }
        this.accounts = {
            [owner.name]:{
                account:owner.name,
                category:'owner',
                level:this.level['owner']
            }
        }
    }

    defineMultipleAccounts(accountPermissionPairs){
        return new Promise(async (resolve)=>{
            if(accountPermissionPairs && Array.isArray(accountPermissionPairs)){
                for await (let pair of accountPermissionPairs){
                    
                    let category = pair.category
                    let account = pair.account
                    if(category && account){
                        let permissionSet = await this.define(account, category)
                        if(permissionSet.error) {
                            resolve({ 
                                error: {
                                    message:permissionSet.error,
                                    account:account, 
                                    category:category
                                }  
                            })
                        }

                    }else{
                        resolve({ error: 'ERROR: provide an account/permission pair like so : {"account":"category"}' }) 
                    }
                }
    
                resolve(true)
            }else{
                throw new Error('Need to provide an array of account/permission category pairs')
            }
        })
        
    }

    define(account, category){
        if(account && category){
            if(this.category.includes(category)){
                this.accounts[account] = {
                    account:account,
                    category:category,
                    level:this.level[category]
                }
                return true;
            }else{
                return { error:'PERMISSION ERROR: Invalid permission category' }
            }
        }else{
            return { error: 'PERMISSION ERROR: Invalid account structure' }
        }
        
    }

    hasPermission(account, category){
        if(account && category){
            if(this.category.includes(category)){
                let level = this.level[category]
                let permission = this.accounts[account]
                if(permission){
                    return permission.level >= level
                }else{
                    return false
                }
            }else{
                return { error:'PERMISSION ERROR: Invalid permission category' }
            }
        }else{
            return { error: 'PERMISSION ERROR: Invalid account structure' }
        }
    }

}

module.exports = Permissions
