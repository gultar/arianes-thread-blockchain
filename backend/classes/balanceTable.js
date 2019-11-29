const sha256 = require('../tools/sha256');
const Database = require('./database')
const { isValidTransactionJSON, isValidActionJSON } = require('../tools/jsonvalidator');
const { readFile, writeToFile, logger } = require('../tools/utils');
const fs = require('fs')
const PouchDB = require('pouchdb')

class BalanceTable{
    constructor(accountTable){
        this.states = {}
        this.history = {}
        this.stateDB = new Database('./data/balanceDB')
        this.accountTable = accountTable
    }

    // saveHistory(blockNumber){
    //     return new Promise((resolve)=>{
    //         if(blockNumber !== undefined){
    //             let publicKeys = Object.keys(this.states)
    //             publicKeys.forEach((key)=>{
    //                 if(this.states[key]){
    //                     if(!this.history[key]) this.history[key] = {}
    //                     if(this.states[key].lastModified == blockNumber){
    //                         this.history[key][blockNumber] = { balance:this.states[key].balance }
    //                     }
                        
    //                 }else{
    //                     logger(`ERROR: State with key ${key} does not exist`)
    //                 }
    //             })
    //             resolve(true)
    //         }else{
    //             resolve({error:'ERROR: Need to specify block number'})
    //         }
    //     })
        
    // }

    runBlock(block){
        return new Promise(async (resolve)=>{
            if(!block) resolve({error:"Block to execute is of undefined"})
            let executed = await this.executeTransactionBlock(block.transactions, block.blockNumber)
            if(executed.errors) resolve({ error: executed.errors })
            let actionsExecuted = await this.payActionBlock(block.actions, block.blockNumber)
            if(actionsExecuted.error) resolve({ error: actionsExecuted.errors })

            let transactionsHashes = Object.keys(block.transactions)

            let actionHashes = []
            if(block.actions){
                actionHashes = Object.keys(block.actions)
            }else{
                actionHashes = []
            }

            // this.saveHistory(block.blockNumber)

            let added = await this.stateDB.put({
                id:block.blockNumber.toString(),
                key: 'blockState',
                value: { 
                    states:this.states,
                    merkleRoot:block.merkleRoot,
                    actionMerkleRoot:block.actionMerkleRoot,
                    transactionsHashes:transactionsHashes,
                    actionHashes:actionHashes
                }
            })

            if(added.error) resolve({error:added.error})
            else resolve(added)

            
        })
        
        
    }

    executeTransactionBlock(transactions, blockNumber){
        return new Promise(async(resolve)=>{
            let hashes = Object.keys(transactions);
            let errors = {}
            for await(var hash of hashes){
                let tx = transactions[hash];
                let executed = ''
                if(tx.type == 'call'){
                    executed = await this.executeTransactionCall(tx, blockNumber)
                }else{
                    executed  = await this.executeTransaction(tx, blockNumber)
                }
                if(executed){
                    if(executed.error){
                        errors[hash] = executed.error;
                    }else{
                        //Let pass to be resolved down below
                    }
                     
                }else{
                    errors[hash] = 'Could not execute transaction'
                }
            }
            
            let numOfErrors = Object.keys(errors).length;
            if(numOfErrors > 0) resolve({errors:errors, blockNumber:blockNumber})
            else resolve(true)
        })
        
    }

    executeTransaction(transaction, blockNumber){
        return new Promise(async (resolve)=>{
            if(isValidTransactionJSON(transaction)){
            
                let fromAddress = transaction.fromAddress;
                let toAddress = transaction.toAddress;
                let amount = transaction.amount;
                let hash = transaction.hash;
                let miningFee = transaction.miningFee;
    
                let fromAccount = await this.accountTable.getAccount(fromAddress);
                
                let toAccount = await this.accountTable.getAccount(toAddress);
            
    
                fromAddress = (typeof fromAccount == 'object' ? fromAccount.ownerKey : fromAddress)
                toAddress = (typeof toAccount == 'object' ? toAccount.ownerKey : toAddress)
    
                if(fromAddress !== 'coinbase'){
                    let coinsSpent = this.spend(fromAddress, amount+miningFee, blockNumber);
                    if(!coinsSpent.error){
                        let coinsGained = this.gain(toAddress, amount, blockNumber);
                        if(coinsGained.error){
                            resolve({ error:coinsGained.error })
                        }else{
                            resolve(true);
                        }
                        
                    }else{
                        resolve({ error:coinsSpent.error });
                    }
                }else{
                    let coinsGained = this.gain(toAddress, amount, blockNumber);
                    if(coinsGained.error){
                        resolve({ error:coinsGained.error })
                    }else{
                        resolve(true)
                    }
                }
                
                
            }
        })
    }

    async executeTransactionCall(transaction, blockNumber){
        if(isValidTransactionJSON(transaction)){
            
            let fromAccountName = transaction.fromAddress;
            let toAccountName = transaction.toAddress;
            let fromAddress = await this.accountTable.getAccount(fromAccountName);
            let toAddress = await this.accountTable.getAccount(toAccountName);

            fromAddress = (fromAddress && typeof fromAddress == 'object' ? fromAddress.ownerKey : fromAccountName)
            toAddress = (toAddress && typeof toAddress == 'object' ? toAddress.ownerKey : toAccountName)

            if(fromAddress && toAddress){
                
                

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
            }else if(fromAddress && !toAccountName){
                return { error: 'Receiver address of account is undefined'}
            }else if(!fromAddress && toAccountName){
                return { error: 'Sender address of account is undefined'}
            }else{
                return { error: 'Both addresses of accounts are undefined'}
            }
            
        }
    }

    payActionBlock(actions, blockNumber){
        return new Promise((resolve)=>{
            if(actions){
                let hashes = Object.keys(actions);
                if(hashes > 0){
                    let errors = {}
                    hashes.forEach( hash=>{
                        let action = actions[hash];
                        let executed = this.payAction(action, blockNumber)
                        if(executed.error) errors[hash] = executed.error;
                    })
                    let numOfErrors = Object.keys(errors).length;
        
                    if(numOfErrors > 0) resolve({errors:errors, blockNumber:blockNumber})
                    else resolve(true)
                }else{
                    resolve(false)
                }
                
            }else{
                resolve(false)
            }

        })
        
    }

    payAction(action, blockNumber){
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

    // rollback(blockNumber){
    //     return new Promise(async (resolve)=>{
    //         if(blockNumber !== undefined){
    //             let publicKeys = Object.keys(this.states)
                
    //             for(var key of publicKeys){
    //                 if(this.history[key]){
    //                     if(this.history[key][blockNumber]){
    //                         this.states[key].balance = this.history[key][blockNumber].balance
    //                         this.states[key].lastModified = blockNumber
    //                     }else{
    //                        if(this.states[key] && this.states[key].lastModified){
    //                            let lastStateBlock = this.states[key].lastModified
    //                            if(this.history[key][lastStateBlock]){
    //                                 this.states[key].balance = this.history[key][lastStateBlock].balance
    //                                 this.states[key].lastModified = blockNumber
    //                            }
                           
    //                        }
    //                     }
                        
    //                 }
                    
    //             }
                
    //             resolve(true)
               
    //         }else{
    //             resolve({error:'ERROR: Need to specify block number'})
    //         }
    //     })
    // }

    rollback(blockNumber){
        return new Promise(async (resolve)=>{
            if(blockNumber !== undefined){
                let entry = await this.stateDB.get(blockNumber.toString())
                if(entry){
                    if(entry.error) resolve({error:entry.error})
                    this.states = entry.blockState.states
                    resolve(true)
                }else{
                    resolve({error:'Could not complete rollback. Missing block state'})
                }

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
            return true
        }else{
            return false
        }
        
    }

    spend(publicKey, value, blockNumber){
        if(publicKey && value >=0 && blockNumber){
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
            return { error:'ERROR: missing required parameters (publicKey, value, blockNumber)' };
        }
        
    }

    gain(publicKey, value, blockNumber){
        if(publicKey && value >=0 && blockNumber){

              if(!this.states[publicKey]){
                let newWallet =  this.addNewWalletKey(publicKey);
                if(!newWallet) return {error:'ERROR: Public key of wallet is undefined'}
              }
              
              let state = this.states[publicKey];
              state.balance += value;
              state.lastModified = blockNumber
              return true;
        }else{
            console.log('Public Key', publicKey)
            console.log('Value', value)
            console.log('BlockNumber', blockNumber)
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

