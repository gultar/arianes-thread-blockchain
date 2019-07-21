const sha256 = require('../tools/sha256');
const { isValidTransactionJSON, isValidActionJSON } = require('../tools/jsonvalidator');
const { readFile, writeToFile, logger } = require('../tools/utils');
const fs = require('fs')

class BalanceTable{
    constructor(state, history){
        this.states = (state?state:{})
        this.history = (history?history:{})
    }

    saveHistory(blockNumber){
        return new Promise((resolve)=>{
            if(blockNumber !== undefined){
                let publicKeys = Object.keys(this.states)
                
                publicKeys.forEach((key)=>{
                    if(this.states[key]){
                        if(!this.history[key]) this.history[key] = {}
                        if(this.states[key].lastModified == blockNumber){
                            this.history[key][blockNumber] = { balance:this.states[key].balance }
                        }
                        
                    }
                })
                resolve(true)
            }else{
                resolve({error:'ERROR: Need to specify block number'})
            }
        })
        
    }

    executeTransactionBlock(transactions, blockNumber){
        return new Promise((resolve)=>{
            let hashes = Object.keys(transactions);
            let errors = {}
            hashes.forEach( hash=>{
                let tx = transactions[hash];
                let executed = this.executeTransaction(tx, blockNumber)
                if(executed.error) errors[hash] = executed.error;
            })
            let numOfErrors = Object.keys(errors).length;

            if(numOfErrors > 0) resolve({errors:errors})
            else resolve(true)
        })
        
    }

    executeTransaction(transaction, blockNumber){
        if(isValidTransactionJSON(transaction)){
            
            let fromAddress = transaction.fromAddress;
            let toAddress = transaction.toAddress;
            let amount = transaction.amount;
            let hash = transaction.hash;
            let miningFee = transaction.miningFee;

            if(fromAddress !== 'coinbase'){
                let coinsSpent = this.spend(fromAddress, amount+miningFee, blockNumber);
                if(!coinsSpent.error){
                    let coinsGained = this.gain(toAddress, amount, blockNumber);
                    
                    if(coinsGained.error){
                        return { error:coinsGained.error }
                    }else{
                        return true;
                    }
                    
                }else{
                    return { error:coinsSpent.error };
                }
            }else{
                let coinsGained = this.gain(toAddress, amount, blockNumber);
                if(coinsGained.error){
                    return { error:coinsGained.error }
                }else{
                    return true;
                }
            }
            
            
        }
    }

    executeActionBlock(actions, blockNumber){
        return new Promise((resolve)=>{
            
            if(actions){
                let hashes = Object.keys(actions);
                if(hashes > 0){
                    let errors = {}
                    hashes.forEach( hash=>{
                        let action = actions[hash];
                        let executed = this.executeAction(action, blockNumber)
                        if(executed.error) errors[hash] = executed.error;
                    })
                    let numOfErrors = Object.keys(errors).length;
        
                    if(numOfErrors > 0) resolve({errors:errors})
                    else resolve(true)
                }else{
                    resolve(false)
                }
                
            }else{
                resolve(false)
            }

        })
        
    }

    executeAction(action, blockNumber){
        if(isValidActionJSON(action)){
            
            let fromAddress = action.fromAddress;
            let hash = action.hash;
            let fee = action.fee;

            let coinsSpent = this.spend(fromAddress, fee, blockNumber);
            if(!coinsSpent.error){
                return true;
            }else{
                return coinsSpent.error;
            }
            
        }
    }

    rollback(blockNumber){
        return new Promise(async (resolve)=>{
            if(blockNumber !== undefined){
                let publicKeys = Object.keys(this.states)
                
                for(var key of publicKeys){
                    if(this.history[key]){
                        if(this.history[key][blockNumber]){
                            this.states[key].balance = this.history[key][blockNumber].balance
                            this.states[key].lastModified = blockNumber
                            logger('Rolled back to selected account state')
                        }else{
                           if(this.states[key] && this.states[key].lastModified){
                               let lastStateBlock = this.states[key].lastModified
                               if(lastStateBlock >= blockNumber && this.history[key][lastStateBlock]){
                                    this.states[key].balance = this.history[key][lastStateBlock].balance
                                    logger('Rolled back to last known account state')
                               }
                           
                           } 
                        }
                        
                    }
                }
                let saved = await this.saveHistory(blockNumber)
                resolve(true)
               
            }else{
                resolve({error:'ERROR: Need to specify block number'})
            }
        })
    }

    getBalance(publicKey){
        return this.states[publicKey]
    }

    addNewWalletKey(publicKey){
        if(publicKey){
            this.states[publicKey] = {
                balance:0,
            }
        }else{
            return false
        }
        
    }

    spend(publicKey, value, blockNumber){
        if(publicKey && value && blockNumber){
            if(!this.states[publicKey]) return {error:'Wallet does not exist'};
            let state = this.states[publicKey];
            if(state.balance > value){
                state.balance -= value;
                state.lastModified = blockNumber
            }else{
                return { error:'ERROR: sending wallet does not have sufficient funds' }
            }
            return true;
        }else{
            return { error:'ERROR: missing required parameters (publicKey, value, txHash)' };
        }
        
    }

    gain(publicKey, value, blockNumber){
        if(publicKey && value && blockNumber){

              if(!this.states[publicKey]){
                let newWallet = this.addNewWalletKey(publicKey);
                if(!newWallet) return {error:'ERROR: Public key of wallet is undefined'}
              }
              
              let state = this.states[publicKey];
              state.balance += value;
              state.lastModified = blockNumber
              return true;
        }else{
            return { error:'ERROR: missing required parameters (publicKey, value, txHash)' };
        }
        
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
                let saved = writeToFile({states:this.states, history:this.history}, './data/balances.json');
                if(saved){
                    logger('Saved balance states table');
                    resolve(saved)
                }
            }catch(e){
                reject(e)
            }
          })
        
      }

}

module.exports = BalanceTable;

