const { logger } = require('../tools/utils')

class DataTable{
    constructor(accounts={}){
        this.accounts = accounts;
        this.contracts = contracts;
    }

    addAccount(account){
        if(account && account instanceof Account){
            if(!this.accounts[accounts.name]){
                this.accounts[account.name] = account;
            }else{
                logger('ERROR: Account already exists')
            }
            
        } 
    }

    removeAccount(account){
        if(account && account instanceof Account){
            if(this.accounts[accounts.name]){
                delete this.accounts[account.name];
            }else{
                logger('ERROR: Account does not exist')
            }
            
        } 
    }

    listAccounts(){
        return this.accounts;
    }
}

module.exports = DataTable;