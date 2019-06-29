const sha256 = require('../tools/sha256');
const { isValidTransactionJSON } = require('../tools/jsonvalidator');
const { readFile, writeToFile, logger } = require('../tools/utils');
const fs = require('fs')

class BalanceTable{
    constructor(state){
        this.state = (state?state:{})
    }

    executeTransactionBlock(transactions){
        return new Promise((resolve)=>{
            let hashes = Object.keys(transactions);
            let errors = {}
            hashes.forEach( hash=>{
                let tx = transactions[hash];
                let executed = this.executeTransaction(tx)
                if(executed.error) errors[hash] = executed.error;
            })
            let numOfErrors = Object.keys(errors).length;

            if(numOfErrors > 0) resolve({errors:errors})
            else resolve(true)
        })
        
    }

    executeTransaction(transaction){
        if(isValidTransactionJSON(transaction)){
            
            let fromAddress = transaction.fromAddress;
            let toAddress = transaction.toAddress;
            let amount = transaction.amount;
            let hash = transaction.hash;
            let miningFee = transaction.miningFee;

            if(fromAddress !== 'coinbase'){
                let coinsSpent = this.spend(fromAddress, amount+miningFee, hash);
                if(!coinsSpent.error){
                    let coinsGained = this.gain(toAddress, amount, hash);
                    return true;
                }else{
                    return coinsSpent.error;
                }
            }else{
                let coinsGained = this.gain(toAddress, amount, hash);
                return true;
            }
            
            
        }
    }

    getBalance(publicKey){
        return this.state[publicKey]
    }

    addNewWalletKey(publicKey){
        this.state[publicKey] = {
            balance:0,
            lastTransaction:'unkown',
        }
        let fingerprintString = JSON.stringify(this.state[publicKey])
        this.state[publicKey].fingerprint = sha256(fingerprintString);
    }

    spend(publicKey, value, txHash){
        if(!this.state[publicKey]) return {error:'Wallet does not exist'};
        let walletState = this.state[publicKey];
        if(walletState.balance > value){
            walletState.balance -= value;
            walletState.lastTransaction = txHash
            let fingerprintString = JSON.stringify(walletState)
            walletState.fingerprint = sha256(fingerprintString);
        }else{
            return { error:'ERROR: sending wallet does not have sufficient funds' }
        }
        
        return true;
    }

    gain(publicKey, value, txHash){
        if(!this.state[publicKey]) this.addNewWalletKey(publicKey);
        let walletState = this.state[publicKey];
        walletState.balance += value;
        walletState.lastTransaction = txHash
        let fingerprintString = JSON.stringify(walletState)
        walletState.fingerprint = sha256(fingerprintString);
        return true;
    }

    loadAllStates(){
        return new Promise(async (resolve, reject)=>{
            
         try{
             fs.exists('./data/balances.json', async (exists)=>{
                 if(exists){
                    let balancesFile = await readFile('./data/balances.json');
                    if(balancesFile){
                        let balances = JSON.parse(balancesFile);
                        if(balances){
                            
                            resolve(balances)
                        }else{
                            resolve(false)
                        }
                    }else{
                        resolve(false)
                    }
                 }else{
                    let savedBalances = await this.saveStates();
                    if(savedBalances){
                        resolve(savedBalances)
                    }else{
                        resolve(false)
                    }
                 }
                
             })

             
         }catch(e){
             console.log(e)
             resolve(false)
         }
        })
       }

      saveStates(){
          return new Promise((resolve, reject)=>{
            try{
                let saved = writeToFile(this.state, './data/balances.json');
                if(saved){
                    logger('Saved balance states table');
                    resolve(this.state)
                }
            }catch(e){
                reject(e)
            }
          })
        
      }

}

module.exports = BalanceTable;

