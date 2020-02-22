let VmBox = require('../classes/contracts/vmController')

let { mempool } = require('./mempool')
let { accountTable, balance } = require('./tables')

module.exports = {
    vmBox:new VmBox({
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
            let isValidPayable = await this.validatePayable(payable)
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
            let isValidContractAction = await this.validateContractAction(contractAction)
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
            let isValidPayable = await this.validatePayable(payable)
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
            return this.getLatestBlock()
          },
          validatePayable:async (payable)=>{
            return await this.validatePayable(payable)
          }
    })
}

/**
 * 
 *     this.vmController = new VMController({
      this.this.contractTable:this.this.this.contractTable,
      accountTable:accountTable,
      buildCode:this.factory.createSingleCode,
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
        let isValidPayable = await this.validatePayable(payable)
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
        let isValidContractAction = await this.validateContractAction(contractAction)
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
        let isValidPayable = await this.validatePayable(payable)
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
        return this.getLatestBlock()
      },
      validatePayable:async (payable)=>{
        return await this.validatePayable(payable)
      }
      
    })
 */