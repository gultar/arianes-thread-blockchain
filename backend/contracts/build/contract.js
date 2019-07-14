const Permissions = require('./permissions')
const sha256 = require('../../tools/sha256')
const { extendContract, becomeContract } = require('../toolbox/contractTools')
const createContractInterface = require('../toolbox/contractInterface')

class Contract{
    constructor(name, creator, contractAccount, opts){
        this.name = name;
        this.creator = creator;
        this.contractAccount = contractAccount;
        this.permissions = {};
        this.hash = '';
        this.state = {}
        if(!creator || !name) throw new Error('Creator account and name required')
    }

    callFunction(action){
        action()
    }

    seal(){
        return new Promise(async (resolve)=>{
            let contractInterface = await this.getInterface()
            let stringed = JSON.stringify(contractInterface)
            resolve(sha256(stringed))
        })
    }

    getInterface(){
        return new Promise(async (resolve)=>{
            let contractInterface = await createContractInterface(this)
            resolve(contractInterface)
        })
    }

    //To be replaced by permission level instead
    hasPermission(accountName, category){
        if(this.permissions && this.permissions.accounts){
            let requiredPermission = this.permissions.level[category]
            if(this.permissions.category.includes(category)){
                if(this.permissions.accounts[accountName] && this.permissions.accounts[accountName].level >= requiredPermission){
                    return true;
                }else{
                    return false;
                }
            }else{
                return false;
            }
        }else{
            return false
        }
        
    }

    definePermissions(accounts){
        return new Promise((resolve)=>{
            if(accounts){
                let permissions = new Permissions(this.creator)
                if(Array.isArray(accounts)){
                    let error = permissions.defineMultipleAccounts(accounts)
                    if(error) resolve({error:error})
                }else if(typeof accounts == 'object'){
                    let added = permissions.define(account)
                    if(added.error) resolve({error:added.error})
                }else{
                    resolve({error:'Invalid account data type'})
                }

                this.permissions = permissions;
                resolve(true)
            }
        })

    }

}

module.exports = Contract
