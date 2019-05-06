const Wallet = require('./wallet')
const sha256 = require('../tools/sha256');
const { logger } = require('../tools/utils');

class Account{
    constructor(name, ownerKey){
        this.name = name;
        this.ownerKey = ownerKey;
        this.data = sha256(JSON.stringify(this));
        this.ownerSignature = '';
        this.contracts = {}
    }

    signAccount(wallet, password){
        return new Promise(async (resolve, reject)=>{
            if(wallet && password && wallet instanceof Wallet){
               let unlocked = await wallet.unlock(password)
               if(unlocked){
                    this.ownerSignature = await wallet.sign(this.data);
                    if(this.ownerSignature){
                        Object.freeze(this);
                        logger(`Wallet ${wallet.name} signed account name ${this.name}`)
                        resolve(true)
                    }else{
                        logger('ERROR: Could not sign account');
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

}

module.exports = Account;