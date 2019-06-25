const { logger } = require('../../tools/utils')
const Account = require('../account');
const Contract = require('./contract')

class DataTable{
    constructor(accounts={}, wallets={}, contracts={}){
        this.accounts = accounts;
        this.walletRef = walletRef;
        this.contracts = contracts;
    }

    addAccount(account){
        if(account && account instanceof Account){
            if(!this.accounts[accounts.name]){
                this.accounts[account.name] = account;
                return true
            }else{
                logger('ERROR: Account already exists')
                return false;
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

    addWalletRef(walletRef){
        if(walletRef){
            if(!this.walletRef[walletRef.name]){
                this.walletRef[walletRef.name] = walletRef;
                return true;
            }else{
                logger('ERROR: Wallet Reference already exists')
                return false
            }
            
        } 
    }

    removeWalletRef(walletRef){
        if(walletRef){
            if(this.walletRef[walletRef.name]){
                delete this.walletRef[walletRef.name];
            }else{
                logger('ERROR: Wallet Reference does not exist')
            }
            
        } 
    }

    listWalletRefs(){
        return this.walletRef;
    }

    addContract(contract){
        if(contract && contract instanceof Contract){
            if(!this.contracts[contract.name]){
                this.contracts[contract.name] = contract;
                return true
            }else{
                logger('ERROR: Contract already exists')
                return false;
            }
            
        } 
    }

    removeContract(contract){
        if(contract && contract instanceof Contract){
            if(this.contract[contract.name]){
                delete this.contract[contract.name];
            }else{
                logger('ERROR: Contract does not exist')
            }
            
        } 
    }

    listContracts(){
        return this.contracts;
    }
}

module.exports = DataTable;