
// const { authenticateAccount } = require('../authentication');
// const { extendContract, createContractInterface } = require('../../toolbox/contractTools')
// const Account = require('../../../classes/account');
// const Wallet = require('../../../classes/wallet');
// const { logger } = require('../../../tools/utils');
// const Action = require('../../../classes/Action')



class Coin{
    constructor(symbol, maxSupply, creator, contractAccount){
        this.className = 'Coin'
        this.symbol = symbol;
        this.maxSupply = maxSupply;
        this.creator = creator;
        this.contract = {}
        this.contractAccount = contractAccount
    }

    async issue(amount, creatorAccount, receivingAccount){
        
        if(amount && creatorAccount && receivingAccount){
             if(
                typeof amount == 'number' &&
                amount > 0 &&
                creatorAccount instanceof Account &&
                receivingAccount instanceof Account
              ){
    
                // let isOwner = await this.requireAuth(creatorAccount)
                let isOwner = this.hasPermission(creatorAccount.name, 'owner')
                if(isOwner){
                   if(this.getSupply() > amount){
                     this.maxSupply = this.maxSupply - amount;
                    let issueAction = new Action({
                        name:this.contractAccount.name,
                        publicKey:this.contractAccount.ownerKey
                    }, 'contract action')
                    issueAction.contractRef = {
                        name:this.className,
                    }
                    issueAction.task = {
                        task:'issue',
                        amount:amount,
                        toAccount:receivingAccount,
                    }
                    issueAction.signature = creatorAccount.ownerSignature
                    issueAction.fee = 0;

                    issueAction.calculateActionHash()

                    return issueAction

                   }else{
                     logger('ERROR: Current coin supply does not allow for issuance of coins')
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

        //Find a way to keep track of state using storage, not json table
        return this.maxSupply;
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



test()


// module.exports = Coin

const test = async()=>{
    // const Wallet = require('Wallet')
    try{
        let w = new Wallet();
        console.log(1)
        await w.init('muppet', 'boom');
        console.log(2)
        let w2 = new Wallet();
        console.log(3)
        // await w2.init('broom', 'kaboom');
        console.log(4)
        let a = new Account('dumbo', w.publicKey);
        console.log(5)
        // let a2 = new Account('fellow', w2.publicKey);
        console.log(6)
        let aCoin = new Account('coinAccount', w.publicKey)
        console.log(aCoin)
        let signed = await a.signAccount(w, 'boom');
        console.log(8)
        // let signed2 = await a2.signAccount(w2, 'kaboom');
        console.log(9)
        let signedCoinAccount = await aCoin.signAccount(w, 'boom');
        console.log(10)
        let coin = new Coin('CUP', 1000*1000, a, aCoin);
        console.log(11)
        coin.definePermissions([{
                account:a,
                category:'owner'
            },
            {
                account:aCoin,
                category:'read'
            }
        ])
        
        // let issue = await coin.issue(1000, a, a2);
        // let issue2 = await coin.issue(1000, a2, aCoin)
        // coin.seal()
        // .then((str) => console.log(str))
        console.log(JSON.stringify(coin))
        // console.log(issue)
        // console.log(issue2)
        // console.log(await createContractInterface(coin))
    }catch(e){
        console.log(e)
    }
   

}