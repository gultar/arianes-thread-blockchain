
class Contract{
    constructor(account={}){
        this.account = account;
        this.creator = {};
        this.permissions = {};
    }

    defineContract(){

    }

    defineClause(){
        
    }

    defineEntity(){

    }

    hasPermission(account, requiredPermission){
        if(permissionTypes.includes(requiredPermission)){
            if(this.permissions[account].permission == requiredPermission){
                return true;
            }else{
                return false;
            }
        }else{
            console.log('ERROR: Invalid permission type')
            return false;
        }
    }

    setPermissions(account, permission){
        const permissionTypes = [ 'read', 'write', 'modify', 'owner' ];
        if(permissionTypes.includes(permission)){
            this.permissions[account.name] = { permission:permission }  //Need to add auth to modify permissions
            return true;
        }else{
            console.log('ERROR: Invalid permission type')
            return false;
        }
        
    }
}

module.exports = Contract