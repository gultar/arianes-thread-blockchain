const { logger } = require('../tools/utils')

class Datatable{
    constructor(accounts={}){
        this.accounts = accounts
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