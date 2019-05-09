const Transaction = require('./transaction')
const Wallet = require('./wallet')
const sha256 = require('../tools/sha256');
const { logger } = require('../tools/utils');
const jsonSize = require('json-size');

class Action{
    constructor(fromAccount, type, task, data='', contractRef={}){
        this.fromAccount = fromAccount; //name 
        this.type = type; //GET, POST, PUT, DELETE, UPDATE
        this.task = task; //Function on the contract
        this.data = data;
        this.timestamp = Date.now();
        this.contractRef = contractRef;  //Contract name
        this.fee = this.setMiningFee()
        this.hash = this.calculateActionHash();
        this.signature = '';
    }

    calculateActionHash(){
       return sha256(this.fromAccount.publicKey + this.type + this.task + this.data + this.fee + this.timestamp + this.contractRef)
    }

    setMiningFee(){
        let actionToWeigh = {
            fromAccount:this.fromAccount,
            type:this.type,task:this.task,
            data:this.data,
            timestamp:this.timestamp, 
            contractRef:this.contractRef
        }
        let size = jsonSize(actionToWeigh);
        let sizeFee = size * 0.0001;
        return sizeFee;
    }

    //Not practical at all
    //Instead, treat as a seperate by transaction-like entity
    storeInTransaction(senderPublicKey){
        try{
            let transaction = new Transaction(senderPublicKey, 'storeInChain', 0, JSON.stringify(this))
            transaction.type = 'action';
            return transaction;
        }catch(e){
            console.log(e)
        }

    }

    //Does it actually work?
    signAction(wallet, password, actionHash){
        return new Promise(async (resolve, reject)=>{
            if(wallet && password && actionHash && wallet instanceof Wallet){
               let unlocked = await wallet.unlock(password)
               if(unlocked){
                    let signature = await wallet.sign(actionHash);
                    if(signature){
                        resolve(signature)
                    }else{
                        logger('ERROR: Could not sign action');
                    }
                }else{
                    logger('ERROR: Could not unlock wallet')
                    resolve(false);
                }       
                
                
            }else{
                logger('ERROR: wallet and password are required to sign action')
                resolve(false)
            }   
        })
    }

}

module.exports = Action;