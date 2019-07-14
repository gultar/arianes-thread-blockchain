const Wallet = require('Wallet')
const Account = require('Account')
const Action = require('Action')
const ContractAction = require('ContractAction')
const Permissions = require('Permissions')
const createContractInterface = require('createContractInterface')
const makeExternal = require('makeExternal')
const getFunctionArguments = require('getFunctionArguments')
const deploy = require('deploy')
const save = require('save')
const commit = require('commit')

class Coin{
    constructor(symbol, maxSupply, creator, contractAccount){
        this.className = 'Coin'
        this.symbol = symbol;
        this.maxSupply = maxSupply;
        this.supply = maxSupply
        this.creator = creator;
        this.contract = {}
        this.contractAccount = contractAccount
        this.permissions = new Permissions(creator)
    }

    substract(amount){
        this.supply -= amount
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
                let isOwner = true//this.permissions.hasPermission(creatorAccount.name, 'owner')
                if(isOwner){
                    
                   if(this.maxSupply > amount){
                    
                     this.maxSupply = this.maxSupply - amount;

                    let issueAction = new ContractAction({
                        name:this.contractAccount.name,
                        publicKey:this.contractAccount.ownerKey
                    })
                    
                    issueAction.defineContractReference(this.contractAccount)
                    
                    //Need to create a balance table for this contract and for each currency
                    issueAction.defineTask({
                        call:"issue",
                        type:"SET",
                        params:{
                            amount:amount,
                            toAccount:receivingAccount
                        }
                    })
                    
                    this.substract(amount)

                    return issueAction

                   }else{
                     console.log('ERROR: Current coin supply does not allow for issuance of coins')
                   }
                   
                }else{
                    console.log("Account" +creatorAccount.name+ "is not authorized to issue coins");
                }
            }else{
                console.log('ERROR: Must pass valid creator and receiving accounts')
            }
        }else{
            console.log('ERROR: Required parameters: amount, creatorAccount and receivingAccount')
        }
        

    }

    async getInterface(){
        let external = makeExternal({
            symbol:this.symbol,
            maxSupply:this.maxSupply,
            className:this.className,
            creator:this.creator,
            contractAccount:this.contractAccount,
            issue:{
                issue:this.issue, 
                args:["amount","creatorAccount","receivingAccount"],
            },
            getSupply:{
                getSupply:this.getSupply,
                args:[]
            }
        })
        let inf = await createContractInterface(external)
        return inf
    }

    getSupply(){
        //Find a way to keep track of state using storage, not json table
        return this.supply;
    }
}

const test = async()=>{
    try{
        let w = new Wallet();
        await w.init('muppet', 'boom');
        // console.log(w)
        let w2 = new Wallet();
         await w2.init('broom', 'kaboom');
        // console.log(w2)
        let a = new Account('dumbo', w.publicKey);
        // console.log(a)
         let a2 = new Account('fellow', w2.publicKey);
        // console.log(a2)
        let aCoin = new Account('coinAccount', w.publicKey)
        // console.log(aCoin)
        let signed = await a.signAccount(w, 'boom');
        // console.log(signed)
         let signed2 = await a2.signAccount(w2, 'kaboom');
        // console.log(signed2)
        let signedCoinAccount = await aCoin.signAccount(w, 'boom');
        // console.log(signedCoinAccount)
        let coin = new Coin('CUP', 1000*1000, a, aCoin);
        
        
        coin.permissions.define(a2, 'read')

        coin.issue(1000, a, a2)
        .then(async (action)=>{
            let inf = await coin.getInterface()
            save({supply: coin.supply, permissions:coin.permissions})
            deploy(inf)
            commit(action)
        })
        
        
        
    }catch(e){
        console.log(e)
    }
}


test()