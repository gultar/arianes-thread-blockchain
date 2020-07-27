const makeExternal = require('makeExternal')
const Permissions = require('Permissions')

class Storage{
    constructor(initParams){
        this.contractAccount = initParams.contractAccount
        this.permissions = new Permissions(this.contractAccount)
        this.state = {
            [initParams.contractAccount]:{}
        }
    }

    setState(state){
        this.state = state
    }

    hasPermissions(id, account){
        let storage = this.state[id]
        
        let hasSomePermissions = storage.permissions.accounts[account];
        if(hasSomePermissions){
            let level = storage.permissions.accounts[account].level;

            let hasRequiredPermissions = level >= storage.permissions.level['write']
            if(hasRequiredPermissions){
                return true;
            }else{
                return false;
            }
        }else{
            return false;
        }
    }

    changePermissions(params, callingAccount){
        let { id, account, level } = params;
        if(!id) throw new Error('Id of entry to set is undefined')
        if(!account) throw new Error('Account to give permissions to is undefined')
        if(!level) throw new Error('Level of permission to set is undefined')

        let storage = this.state[id];
        if(storage){
            let permissions = storage.permissions.accounts[callingAccount.name]
            if(permissions){
                let isAllowedToChangePermissions = permissions.level >= storage.permissions.level['modify']
                if(isAllowedToChangePermissions){
                    let isValidPermission = storage.permissions.level[level]
                    if(isValidPermission){
                        this.state[id].permissions.accounts[account] = {
                            account:account,
                            category:level,
                            level:storage.permissions.level[level]
                        }
                        return true;
                    }else{
                        throw new Error('Is invalid permission category' )
                    }
                }else{
                    throw new Error('Calling account is not allowed to change permissions')
                }
            }else{
                throw new Error('Calling account does not have any permissions')
            }
        }else{
            throw new Error(`Storage with id ${id} does not exist`)
        }
    }

    set(entry, account){  //Account passed in a full account object.
        if(!entry) throw new Error('Entry to set is undefined')

        let { id, data } = entry;
        if(!id) throw new Error('Id of entry to set is undefined')
        if(!data) throw new Error('Data of entry to set is undefined')

        if(this.state[id]){
            let isAllowed = this.hasPermissions(id, account.name || account)   //Need to only pass account name since function param is a full object
            if(!isAllowed) return { error: 'Calling account does not have permission to modify data storage' }
            else{
                this.state[id].data = data;
                return true
            }
        }else{
            this.state[id] = {
                permissions:new Permissions(account),
                data:data
            }
            return true
        }
        
        
        
    }

    get(params){
        let { id } = params
        if(!id) throw new Error('Id of data to get is undefined')
        let storage = this.state[id]
        if(storage){
            let data = storage.data;
            if(data) return data
            else return { error:'Data not found' }
        }else{
            return { error:'Storage requested does not exist' }
        }
    }

    getInterface(){
        let external = makeExternal({
            set:{
                type:'set',
                args:["id","data","account"],
                description:'save or modify data field'
            },
            changePermissions:{
                type:'set',
                args:['id','account','level'],
                description:'change permissioned accounts on data field'
            },
            get:{
                type:'get',
                args:['id'],
                description:'get data from field using id'
            }
        })

        return external;
    }
}