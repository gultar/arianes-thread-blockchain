const Wallet = require('./wallet')
const Action = require('./action')
const sha256 = require('../tools/sha256');
const { logger } = require('../tools/utils');

class Account{
    constructor(name, ownerKey){
        this.name = name;
        this.ownerKey = ownerKey;
        this.hash = sha256(JSON.stringify(this));
        this.ownerSignature = '';
    }

    signAccount(wallet, password){
        return new Promise(async (resolve, reject)=>{
            if(wallet && password && wallet instanceof Wallet){
               let unlocked = await wallet.unlock(password)
               if(unlocked){
                 let signature = await wallet.sign(this.hash);
                 if(signature){
                     this.ownerSignature = signature;
                     resolve(signature);
                 }else{
                     logger('ERROR: Could not sign account')
                 }
                }else{
                    logger('ERROR: Could not unlock account')
                    resolve(false);
                }       
                
                
            }else{
                logger('ERROR: wallet and password are required to sign account')
                resolve(false)
            }   
        })
       
        
    }

    emitContract(pathToFile){
        if(pathToFile){
            //create transaction and send to node
        }
    }

    async emitAction(type, task, onContract){
        let accountRef = {
            name:this.name,
            publicKey:this.ownerKey
        }
        let action = new Action(accountRef, type, task, onContract);
        return action;
    }

}

module.exports = Account;