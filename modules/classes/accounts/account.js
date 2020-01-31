/**
 TFLB | Thousandfold Blockchain
 @author: Sacha-Olivier Dulac
*/

const Wallet = require('../wallets/wallet')
const Action = require('../actions/action')
const sha256 = require('../../tools/sha256');
const { logger } = require('../../tools/utils');

class Account{
    constructor(name, ownerKey, type){
        this.name = name;
        this.ownerKey = ownerKey;
        this.hash = sha256(JSON.stringify(this));
        this.ownerSignature = '';
        this.type = type
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


}

module.exports = Account;