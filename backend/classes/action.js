const Wallet = require('./wallet')
const sha256 = require('../tools/sha256');
const { logger } = require('../tools/utils');
const jsonSize = require('json-size');

class Action{
    constructor(fromAccount, type, task, data='', contractRef={}){
        this.fromAccount = fromAccount; 
        this.type = type; 
        this.task = task; //Function on the contract
        this.data = data;
        this.timestamp = Date.now();
        this.contractRef = contractRef;  //Contract name
        this.fee = this.setMiningFee()
        this.hash = this.calculateActionHash();
        this.signature = '';
    }

    calculateActionHash(){
       return sha256(this.fromAccount + this.type + this.task + this.data + this.fee + this.timestamp)
    }

    setMiningFee(){
        let actionToWeigh = {
            fromAccount:this.fromAccount,
            type:this.type,
            task:this.task,
            data:this.data,
            timestamp:this.timestamp, 
            contractRef:this.contractRef,
        }
        let size = jsonSize(actionToWeigh);
        let sizeFee = size * 0.0001;
        return sizeFee;
    }

    defineContractReference(contract){
        this.contractRef = {
            contractName:contract.name,
            creator:contract.ownerKey
        }
        this.calculateActionHash()
    }

    defineTask({ contractName, method, params }){
        this.type = 'contract'
        this.task = 'call'
        this.data = {
            contractName:contractName, //Contract method
            method:method,
            params:params
        }
        this.calculateActionHash()
    }

    //Deprecated
    setFee(){
        let actionToWeigh = {
            fromAccount:this.fromAccount,
            type:this.type,task:this.task,
            data:this.data,
            timestamp:this.timestamp, 
            contractRef:this.contractRef
        }
        let size = jsonSize(actionToWeigh);
        let sizeFee = size * 0.0001;
        this.fee = sizeFee;
        this.calculateActionHash()
    }

    

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

    sign(wallet, password){
        return new Promise(async (resolve, reject)=>{
            if(wallet && password && actionHash && wallet instanceof Wallet){
               let unlocked = await wallet.unlock(password)
               if(unlocked){
                    let signature = await wallet.sign(this.hash);
                    if(signature){
                        this.signature = signature;
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