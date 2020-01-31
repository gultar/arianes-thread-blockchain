/**
 TFLB | Thousandfold Blockchain
 @author: Sacha-Olivier Dulac
*/

const WalletManager = require('../wallets/walletManager');
const Account = require('../account/account')

class AccountCreator{
    constructor(){
        this.accounts = {};
        this.manager = new WalletManager();
    }

    async createAccount(name, accountType, walletName, password){
        return new Promise(async (resolve, reject) =>{
          
          try{
            if(name && walletName && password){
                
                let wallet = await this.manager.loadByWalletName(walletName);
                let account = new Account(name, wallet.publicKey, accountType);
                let signature = await account.signAccount(wallet, password);
                account.ownerSignature = signature
                resolve(account)
            }else{
                logger(chalk.red('ERROR: Need to provide a wallet name and a password'));
                resolve(false);
            }
    
          }catch(e){
            console.log(e);
            resolve(false);
          }
        })
    
      }
      
}

module.exports = AccountCreator