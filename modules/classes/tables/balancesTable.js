const sha256 = require('../../tools/sha256');
const Database = require('../database/db')
const { isValidTransactionJSON, isValidActionJSON } = require('../../tools/jsonvalidator');
const { readFile, writeToFile, logger } = require('../../tools/utils');
const fs = require('fs')

class BalanceTable{
    constructor(){
        this.balances = {}
        this.balancesDB = new Database('balances') //./data/balanceDB
        this.accountTable = accountTable
    }

    async extractTransactionCalls(transactions){
        let calls = {}
        for await(let hash of Object.keys(transactions)){
            let transaction = transactions[hash]
            if(transaction.type == 'call'){
                calls[hash] = transaction
            }
        }

        if(Object.keys(calls).length > 0){
            return calls
        }else{
            return false
        }
    }

    runBlock(block){}

    executeTransactionBlock(transactions, blockNumber){}

    executeTransaction(transaction, blockNumber){}

    async executeTransactionCall(transaction, blockNumber){}

    payActionBlock(actions, blockNumber){}

    payAction(action, blockNumber){}

    rollback(blockNumber){}

    getBalance(publicKey){
        return this.balances[publicKey]
    }

    addNewWalletKey(publicKey){
        if(publicKey){
            this.balances[publicKey] = {
                balance:0,
            }
            return true
        }else{
            return false
        }
        
    }

    spend(publicKey, value, blockNumber){
        if(publicKey && value >=0 && blockNumber){
            if(!this.balances[publicKey]) return {error:'Wallet does not exist'};
            let state = this.balances[publicKey];
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

              if(!this.balances[publicKey]){
                let newWallet =  this.addNewWalletKey(publicKey);
                if(!newWallet) return {error:'ERROR: Public key of wallet is undefined'}
              }
              
              let state = this.balances[publicKey];
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

   

       async saveBalances(block){
            if(block){
                 
                let added = await this.balancesDB.put({
                    key:block.blockNumber.toString(),
                    value: { 
                        balances:this.balances,
                        merkleRoot:block.merkleRoot,
                        actionMerkleRoot:block.actionMerkleRoot,
                        transactionsHashes:block.txHashes,
                        actionHashes:block.actionHashes
                    }
                })
                
                if(added.error) return {error:added}
                else return added
            }else{
                return {error:'ERROR: Could not save balance states. Block provided is undefined'}
            }
       }

       async loadBalances(blockNumber){
            let balances = await this.getBalancesFromDB(blockNumber)
            if(balances.error) throw new Error(balances.error)

            this.balances = balances

            return { loaded:balances }
       }

       async getBalancesFromDB(blockNumber){
            if(typeof blockNumber == 'number') blockNumber = blockNumber.toString()
            let blockState = await this.balancesDB.get(blockNumber)
            if(blockState){
                if(blockState .error) return {error:blockState.error}
                return blockState.balances || blockState.states
            }else{
                return {error:new Error('ERROR: Could not load balance states at block number '+blockNumber)}
            }
       }

}