const Permissions = require('./permissions')
const { serializeActiveObject } = require('../toolbox/contractTools')
const Account = require('../../classes/account')
const { loopOverMethods } = require('../../tools/utils')
const sha256 = require('../../tools/sha256')

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
        try{
            let contract = JSON.stringify(this)
            let hash = sha256(contract)
            return hash
        }catch(e){
            console.log(e)
            return false
        }
    }

    hasPermission(accountName, requiredPermission){
        if(this.permissions.levels.includes(requiredPermission)){
            if(this.permissions.accounts[accountName].level == requiredPermission){
                return true;
            }else{
                return false;
            }
        }else{
            return false;
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
