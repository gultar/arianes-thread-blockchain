let _ = require('private-parts').createKey();
const authenticateAccount = require('../build/authentication');
const Account = require('../../classes/account');
const Wallet = require('../../classes/wallet');
const { logger } = require('../../tools/utils');
const Transaction = require('../../classes/transaction')

class Coin{
    constructor(symbol, maxSupply, creator){
        this.symbol = symbol;
        _(this).maxSupply = maxSupply;
        this.creator = creator;
    }
    
    async issue(amount, creatorAccount, receivingAccount){
        if(amount && creatorAccount && receivingAccount){
             if(
                typeof amount == 'number' &&
                amount > 0 &&
                creatorAccount instanceof Account &&
                receivingAccount instanceof Account
              ){
    
                let isOwner = await this.requireAuth(creatorAccount)
                if(isOwner){
                    let action = {
                        action:'issue',
                        contract:'CUP',
                        params:{
                            amount:amount,
                            ownerAccount:creatorAccount,
                            receivingAccount:receivingAccount
                        },
                        data:'awdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww'
  
                      }
//                     
                    let tx = new Transaction(creatorAccount.ownerKey, receivingAccount.ownerKey, 0, action)
                
                    console.log(JSON.stringify(tx, null, 2))
                   if(this.getSupply() > amount){
                     _(this).maxSupply = _(this).maxSupply - amount;
                   }else{
                     logger('ERROR: Could not issue coins. Max supply is too low')
                   }
                   
                }else{
                    logger(`Account ${creatorAccount.name} is not authorized to issue coins`);
                }
            }else{
                logger('ERROR: Must pass valid creator and receiving accounts')
            }
        }else{
            logger('ERROR: Required parameters: amount, creatorAccount and receivingAccount')
        }
        

    }

    getSupply(){
        return _(this).maxSupply;
    }

    async requireAuth(account){
        return new Promise(async (resolve, reject)=>{
            if(account instanceof Account){
                if(account.ownerKey == this.creator.ownerKey){
                    let isOwner = await authenticateAccount(account)
                    if(isOwner){
                        resolve(true)
                    }else{
                        logger(`ERROR: Authentication failed. Account is not owner of coin ${this.symbol}`)
                        resolve(false)
                    }
                }else{
                    logger('ERROR: Authentication failed. Public key mismatch')
                    resolve(false)
                }
            }else{
                logger('ERROR: Must provide valid account to authenticate')
            }
            
        })
        
    }
}

const test = async()=>{
    let w = new Wallet();
    await w.init('muppet', 'boom');
    let w2 = new Wallet();
    await w2.init('broom', 'kaboom');

    let a = new Account('dumbo', w.publicKey);
    let a2 = new Account('fellow', w2.publicKey);

    let signed = await a.signAccount(w, 'boom');

    let signed2 = await a2.signAccount(w2, 'kaboom');

    let coin = new Coin('CUP', 1000*1000, a);
    let issue = await coin.issue(1000, a, a2);
    

}

test()


module.exports = Coin