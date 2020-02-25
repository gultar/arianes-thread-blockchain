const ContractTable = require('../tables/contractTable')
const VMController = require('../contracts/vmController')
const Factory = require('../contracts/build/callFactory')

let { accountTable } = require('../../instances/tables')
let { mempool } = require('../../instances/mempool')
let { blockchain } = require('../../instances/blockchain')

let { logger } = require('../../tools/utils')
let chalk = require('chalk')

let chainLog = require('debug')('chain')

let contractLog = require('debug')('contract')


class BlockRuntime{
    constructor(){
        this.contractTable = new ContractTable({
          getCurrentBlock:async ()=>{
            return await blockchain.getLatestBlock()
          },
          getBlock:(number)=>{
            return blockchain.chain[number]
          },
        })
        
        this.factory = new Factory({
          accountTable:accountTable,
          contractTable:this.contractTable,
          getBlockNumber:()=>{
            return blockchain.getLatestBlock()
          }
        })
        this.vmBox = new VMController({
          contractTable:this.contractTable,
          getBalance:async (accountName)=>{
            if(!accountName) return { error:'ERROR: Undefined account name' }
            let account = await accountTable.getAccount(accountName)
            if(account.error) return { error:account.error }

            let balance = balance.getBalance(account.ownerKey)
            if(balance.error) return { error:balance.error }
            else return balance
        },
        deferContractAction:async(contractAction)=>{
            let deferred = await mempool.deferContractAction(contractAction)
            if(deferred){
              return deferred
            }else{
              return false
            }
        },
        deferPayable:async(payable, test=false)=>{
            let isValidPayable = await blockchain.validatePayable(payable)
            if(isValidPayable.error) return { error:isValidPayable.error }
            else{
              if(!test){
                let deferred = await mempool.deferPayable(payable)
                if(deferred){
                  return deferred
                }else{
                  return false
                }
              }else{
                return { deferred:true }
              }
            }
            
          },
          emitContractAction:async(contractAction)=>{
            let isValidContractAction = await blockchain.validateContractAction(contractAction)
            if(isValidContractAction.error) return { error:isValidContractAction.error }
            else{
              let added = await mempool.addAction(contractAction)
              if(added.error) return { error:added.error }
              else{
                return added
              }
            }
          },
          emitPayable:async(payable, test=false)=>{
            let isValidPayable = await blockchain.validatePayable(payable)
            if(isValidPayable.error) return { error:isValidPayable.error }
            else{
              if(!test){
                let added = await mempool.addTransaction(payable)
                if(added.error) return { error:added.error }
                else{
                  return added
                }
              }else{
                return { emitted:true }
              }
            }
          },
          getCurrentBlock:async ()=>{
            return blockchain.getLatestBlock()
          },
          validatePayable:async (payable)=>{
            return await blockchain.validatePayable(payable)
          }
        })
    }

    async executeBlock(newBlock){
        let newHeader = blockchain.extractHeader(newBlock)
        blockchain.chain.push(newHeader);

        let executed = await blockchain.processBlock(newBlock)
        chainLog('Block executed:', executed)
        if(executed.error){
          blockchain.chain.pop()
          return { error:executed.error }
        }
        else {
    
          
          // if(executed.error){
          //   blockchain.chain.pop()
          //   return { error:executed.error }
          // }
    
          let added = await blockchain.addBlockToDB(newBlock)
          chainLog('Block added to DB', added)
          if(added.error){
            blockchain.chain.pop()
            return { error:added.error }
          }
          else{
            this.runCallsAndActions(newBlock)
            
            await blockchain.manageChainSnapshotQueue(newBlock)
            logger(`${chalk.green('[] Added new block')} ${newBlock.blockNumber} ${chalk.green('to chain:')} ${newBlock.hash.substr(0, 20)}...`)
            return added
          }
        }
    
    }

    async runCallsAndActions(newBlock, newHeader){
        let actions = newBlock.actions || {}
        let allActionsExecuted = await this.executeActionBlock(actions)
        chainLog('All actions executed', allActionsExecuted)
        if(allActionsExecuted.error) return { error:allActionsExecuted.error }
        
        let callsExecuted = await this.runTransactionCalls(newBlock);
        chainLog('Call executed', callsExecuted)
        if(callsExecuted.error) return { error:callsExecuted.error }

        let statesSaved = await this.contractTable.saveStates()
        chainLog('Contract states saved', statesSaved)
        if(statesSaved.error) return { error:statesSaved.error }

        return { executed:true }
    }

    executeActionBlock(actions){
        return new Promise(async (resolve)=>{
          if(actions && Object.keys(actions).length){
            
            for await(let hash of Object.keys(actions)){
              let action = actions[hash]
              let results = {}
              let errors = {}
              let result = await this.handleAction(action)
              if(result.error) errors[hash] = result.error
              else{
                results[hash] = result
              }
    
              if(Object.keys(errors).length > 0){
                resolve({error:errors})
              }else{
                resolve(results)
              }
            }
            
          }else{
            resolve(false)
          }
        })
      }
    
      handleAction(action){
        return new Promise(async (resolve)=>{
          switch(action.type){
            case 'account':
              if(action.task == 'create'){
                let added = await accountTable.addAccount(action.data);
                
                if(added){
                  resolve(true)
                }else{
                  resolve({error:'ERROR: Account already exists'})
                }
              }
    
              if(action.task == 'delete'){
                let account = await accountTable.getAccount(action.data.name)
                if(!account || account.error) resolve({error:`ERROR: Could not delete account. Account ${action.data.name} not found`})
                else{
                  let deleted = await accountTable.deleteAccount({
                    name:action.data.name,
                    action:action,
                  }, action);
                
                  if(deleted && !deleted.error){
                    resolve(true)
                  }else if(deleted.error){
                    resolve({error:deleted.error})
                  }else{
                    resolve({error:'ERROR: Account already exists'})
                  }
                }
              }
    
              break;
            case 'contract':
              if(action.task == 'deploy'){
                
                let deployed = await this.deployContract(action)
                if(deployed.error){
                  resolve({error:deployed.error})
                }else{
                  resolve(true)
                }
                
              }
    
              if(action.task == 'call'){
                let executed = await this.executeSingleCall(action)
                if(executed){
                  if(executed.error){
                    resolve({error:executed.error})
                  }else{
                    resolve(executed)
                  }
                }else{
                  resolve({error:'Function has returned nothing'})
                }
                
              }
    
              if(action.task == 'destroy'){
               let destroyed = await this.destroyContract(action);
               if(destroyed.error){
                  resolve({error:destroyed.error})
               }else{
                  resolve(destroyed)
               }
                
              }
              resolve({error:'ERROR: Unknown contract task'})
              break;
            case 'contract action':
              if(action.task == 'call'){
                let executed = await this.executeSingleCall(action)
                if(executed){
                  if(executed.error){
                    resolve({error:executed.error})
                  }else{
                    resolve(executed)
                  }
                }else{
                  resolve({error:'Function has returned nothing'})
                }
                
              }
              break;
            default:
              console.log(action)
              resolve({error:'ERROR: Invalid contract call'})
          }
          
          
        })
      }
    
      testHandleAction(action){
        return new Promise(async (resolve)=>{
          switch(action.type){
            case 'account':
              if(action.task == 'create'){
                let account = action.data
                let existing = await accountTable.accountsDB.get(account.name)
                if(!existing){
                  resolve(true)
                }else{
                  if(existing.error) resolve({error:existing.error})
                  resolve({error:'ERROR: Account already exists'})
                }
              }
              if(action.task == 'delete'){
                let account = action.data
                let existing = await accountTable.accountsDB.get(account.name)
                if(existing){
                  resolve(true)
                }else{
                  if(existing.error) resolve({error:existing.error})
                  resolve({error:`ERROR: Could not delete account ${account.name}`})
                }
              }
              resolve({ error:'ERROR: Unkown account action task' })
              break;
            case 'contract':
              if(action.task == 'deploy'){
                
                let deployed = await this.testDeployContract(action)
                if(deployed.error){
                  resolve({error:deployed.error})
                }else{
                  resolve(true)
                }
                
              }
    
              if(action.task == 'destroy'){
                let destroyed = await this.testDestroyContract(action)
                if(destroyed.error){
                  resolve({error:destroyed.error})
                }else{
                  resolve(destroyed)
                }
                
              }
    
              if(action.task == 'call'){
                let executed = await this.executeSingleCall(action)
                if(executed){
                  if(executed.error){
                    resolve({error:executed.error})
                  }else{
                    resolve(executed)
                  }
                }else{
                  resolve({error:'Function has returned nothing'})
                }
                
              }
              resolve({error:'ERROR: Unknown contract task'})
              break;
            default:
              resolve({error:'ERROR: Invalid contract call'})
          }
          
          
        })
      }
    
      destroyContract(action){
        return new Promise(async (resolve)=>{
          let contractName = action.data.name;
          
          let account = await accountTable.getAccount(action.fromAccount);
          let contract = await this.contractTable.getContract(contractName);
          if(contract){
            if(contract.error) resolve({error:contract.error})
            let contractAccount = contract.account
            if(contractAccount){
              let isValidDestroyActionSignature = await blockchain.validateActionSignature(action, contractAccount.ownerKey)
              if(isValidDestroyActionSignature){
                let deleted = await this.contractTable.removeContract(contractName);
                if(deleted.error){
                  resolve({error:deleted.error})
                }else if(deleted && !deleted.error){
                  resolve(deleted)
                }
              }else{
                resolve({error:'Only the creator of the contract may destroy it'})
              }
              
            }else{
              resolve({error: 'Could not find contract account'})
            }
            
          }else{
            resolve({error:'Could not find contract to destroy'})
          }
          
        })
      }

      testDestroyContract(action){
        return new Promise(async (resolve)=>{
          let contractName = action.data.name;
          
          let account = await accountTable.getAccount(action.fromAccount);
          let contract = await this.contractTable.getContract(contractName);
          if(contract){
            if(contract.error) resolve({error:contract.error})
            let contractAccount = contract.account
            if(contractAccount){
              let isValidDestroyActionSignature = await blockchain.validateActionSignature(action, contractAccount.ownerKey)
              if(isValidDestroyActionSignature){
                resolve({
                  contractDeleted:true,
                  stateDeleted:true
                })
              }else{
                resolve({error:'Only the creator of the contract may destroy it'})
              }
              
            }else{
              resolve({error: 'Could not find contract account'})
            }
            
          }else{
            resolve({error:'Could not find contract to destroy'})
          }
          
        })
      }
    
      deployContract(action){
        return new Promise(async (resolve)=>{
          let data = action.data
          let account = await accountTable.getAccount(action.fromAccount)
          
          if(account){
            //Validate Contract and Contract API
            let contractEntry = {
              name:data.name,
              contractAPI:data.contractAPI,
              initParams:data.initParams,
              account:account, 
              code:data.code,
              state:data.state
            }
    
            let added = await this.contractTable.addContract(contractEntry)
            if(added){
              if(added.error) resolve({error:added.error})
              logger(`Deployed contract ${contractEntry.name}`)
              resolve(true)
            }else{
              resolve({error:'ERROR: Could not add contract to table'})
            }
           
            
          }else{
            resolve({error:'ACTION ERROR: Could not get contract account '+action.fromAccount})
          }
        })
      }
    
      testDeployContract(action){
        return new Promise(async (resolve)=>{
          let data = action.data
          let account = await accountTable.getAccount(action.fromAccount)
          
          if(account){
            
            let alreadyExists = await this.contractTable.contractDB.get(data.name)
            if(!alreadyExists){
                
                resolve({ success:`Deployed contract ${data.name} successfully` })
            }else{
                resolve({error:'A contract with that name already exists'})
            }
    
          }else{
            resolve({error:'ACTION ERROR: Could not get contract account'})
          }
        })
      }
    
     
    
      async executeManyCalls(calls){
        for await(let hash of Object.keys(calls)){
          let call = calls[hash]
          this.factory.addCall(call, call.data.contractName)
        }
    
        let codes = await this.factory.buildCode()
        contractLog('Built the code', (codes.error? codes.error:true))
        if(codes.error) return {error:codes.error}
        
        let results = await this.vmBox.executeCalls(codes)
        contractLog('Calls executed:', results)
        if(results.error) return { error:results.error }
        else return results
      }
    
      executeSingleCall(call){
        return new Promise(async (resolve)=>{
            this.factory.addCall(call, call.data.contractName)
            let code = await this.factory.buildCode()
            contractLog('Built the code', (code.error? code.error:true))
            if(code.error) resolve({error:code.error})
            
            let result = await this.vmBox.executeCalls(code)
            contractLog('Call executed:', result)
            if(result){
              if(result.error) resolve({error:result.error})
              else resolve(result)
            }else{
              resolve({ error:'ERROR: VM did not result any results' })
            }
        })
      }
    
      testCall(call){
        return new Promise(async (resolve)=>{
          
          let code = await this.factory.createSingleCode(call)
          contractLog('[TEST] Built the code', (code.error? code.error:true))
          if(code.error) resolve({error:code.error})
          
          let result = await this.vmBox.test(code)
          contractLog('[TEST] Call executed:', result)
          if(result){
            if(result.error) resolve({error:result.error})
            else resolve(result)
          }else{
            resolve({ error:'ERROR: VM did not result any results' })
          }
              
        })
      }
    
      rollbackActionBlock(actions){
          return new Promise(async (resolve)=>{
              if(actions){    
                  let hashes = Object.keys(actions)
                  let endIndex = hashes.length - 1
                  let errors = {}
                  for(var index=endIndex; index >= 0; index--){
                      let hash = hashes[index];
                      let action = actions[hash]
                      let rolledBack = await this.rollbackAction(action)
                      if(rolledBack.error) errors[action.hash] = rolledBack.error
                  }
              }else{
                  resolve({error:'Action block is undefined'})
              }
          })
      }
    
      rollbackAction(action){
          return new Promise(async (resolve)=>{
              if(action.type == 'account'){
                if(action.task == 'create'){
                  let accountData = action.data
                  let account = await accountTable.getAccount(accountData.name)
                  if(account){
                    if(account.error) resolve({error:account.error})
                    let deleted = await accountTable.deleteAccount({ name:account.name, action:action })
                    if(deleted.error) resolve({error:deleted.error})
                    else resolve(deleted)
                  }else{
                    resolve({error:`Could not find account ${accountData.name} in database`})
                  }
                }
              }else if(action.type == 'contract'){
                if(action.task == 'deploy'){
                  let contractData = action.data
                  let exists = await this.contractTable.getContract(contractData.contractName)
                  if(exists){
                    if(exists.error) resolve({error:exists.error})
                    else{
                      let deleted = await this.contractTable.removeContract(contractData.contractName)
                      if(deleted.error) resolve({error:deleted.error})
                      else resolve(deleted)
                    }
                  }else{
                    resolve({error:`Contract ${contractData.contractName} does not exist`})
                  }
                }
              }
          })
      }

      

  convertTransactionToCall(transaction){
    return new Promise(async (resolve)=>{
      let fromAccount = await accountTable.getAccount(transaction.fromAddress)
      if(fromAccount.error) resolve({error:fromAccount.error})
      let toAccount = await accountTable.getAccount(transaction.toAddress) //Check if is contract
      if(toAccount.error) resolve({error:toAccount})

      let payload = transaction.data

      let call = {
        fromAccount: fromAccount.name,
        data:{
          contractName: toAccount.name,
          method: payload.method,
          params: payload.params,
          memory:payload.memory,
          cpuTime:payload.cpuTime
        },
        hash:transaction.hash,
        transaction:transaction
      }

      resolve(call)
    })
  }

  runTransactionCalls(block){
    return new Promise(async (resolve)=>{
      let transactions = block.transactions;
      let txHashes = Object.keys(block.transactions);
      let errors = {}
      let calls = {}
      for await(var hash of txHashes){
        let transaction = transactions[hash];
        
        if(transaction.type == 'call'){
          let call = await this.convertTransactionToCall(transaction)
          if(call.error) resolve({error:call.error})
          else calls[call.hash] = call
        }

        
      }

      if(Object.keys(calls).length > 0){
        if(Object.keys(calls).length == 1){
          let hash = Object.keys(calls)[0];

          let call = calls[hash]

          let result = await this.executeSingleCall(call)
          if(result.error) resolve({error:result.error})
          else{
            resolve(result)
          }
        }else{
          let results = await this.executeManyCalls(calls)
          if(results){
            if(results.error) resolve({error:results.error})
            else if(Object.keys(results).length > 0){
              resolve(results)
                
            }else{
              resolve({error:'ERROR: Call execution returned an empty result object'})
            }
          }else{
            resolve({error:'ERROR: Call execution did not return any result'})
          }
        }
 
      }else{
        resolve(true)
      }
       
      
    })
  }

  async rollback(blockNumber){
    let that = this
    let rolledBackChain = await blockchain.rollbackToBlock(blockNumber, this.contractTable)
    if(rolledBackChain.error) return { error:rolledBackChain.error }
    else return rolledBackChain
  }

    
}

module.exports = BlockRuntime