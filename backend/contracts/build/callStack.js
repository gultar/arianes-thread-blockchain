
let vmInterface = require('./vmInterface')
let EventEmitter = require('events')
let cluster = require('cluster')

class ExecutionSignal extends EventEmitter{
  constructor(){
    super()
  }
}

class Stack{
    constructor({ contractTable, accountTable, getBlockNumber }){
        this.stack = []
        this.contractTable = contractTable
        this.accountTable = accountTable
        this.getBlockNumber = getBlockNumber
        this.resultEvents = new ExecutionSignal()
        this.resultPayload = {}
    }

    addNewCall(call){
        this.stack.unshift(call)
        return true;
    }

    loadCall(call){
      return `
      let actionString = '${JSON.stringify(call)}'
      let action = JSON.parse(actionString);
      params.callingAction = action
      `
    }

    loadParams(params){
      return `
      let paramsString = '${JSON.stringify(params)}'
      let params = JSON.parse(paramsString)
      `
    }

    loadInitParams(initParams){
      return `
      let initParamsString = '${JSON.stringify(initParams)}'
      let initParams = JSON.parse(initParamsString)
      `
    }

    loadCallingAccount(account){
      return `
      let callerAccountString = '${JSON.stringify(account)}'
      let callerAccount = JSON.parse(callerAccountString)
      `
    }

    loadCurrentState(contractState){
      return `
      let currentStateString = '${JSON.stringify(contractState)}'
      let currentState = JSON.parse(currentStateString)
      await instance.setState(currentState)
      `
    }

    loadInstruction({ 
      loadParams, 
      loadCall, 
      loadCallingAccount, 
      loadInitParams, 
      loadCurrentState, 
      call, 
      method }){

      let instruction = 
      `
        let failure = ''
        let fail = require('fail')

        async function execute(){
          let instance = {};
          
          try{
            const commit = require('commit')
            const save = require('save')
            
            ${loadParams}
            ${loadCall}
            ${loadCallingAccount}
            ${loadInitParams}
            instance = new ${call.data.contractName}(initParams)
            ${loadCurrentState}
            let result = await instance['${method}'](params, callerAccount)
            save(instance.state)
            commit(result)
            
            
          }catch(err){
            failure = err
          }
            
          
        }

        execute()
        .then(()=>{
          if(failure) throw new Error(failure.message)
          fail(e)
        })
        .catch((e)=>{
          fail(e)
        })
        
      `
      return instruction
    }

    

    async goThroughStack(result){
      if(result){
        if(result.error){
          this.resultPayload[result.call.hash] = { error:result.error }
          this.resultEvents.emit('result', { error:result.error })
        }else if(result.isReadOnly){
          this.resultPayload[result.call.hash] = { isReadOnly:result.isReadOnly }
          this.resultEvents.emit('result', { isReadOnly:result.isReadOnly })
        }else{
          this.resultPayload[result.call.hash] = { success:result.success }
          this.resultEvents.emit('result', { success:result.success  })
        }
      }

      let call = this.stack.pop()

      if(!call){
        let result = JSON.parse(JSON.stringify(this.resultPayload))
        this.resultPayload = {}
        return result
      }else{
            try{
            let account = await this.accountTable.getAccount(call.fromAccount)
              if(account){
                let contract = await this.contractTable.getContract(call.data.contractName)
                if(contract){
                  if(contract.error) return await this.goThroughStack({error:contract.error, call:call})

                  let isReadOnly = false
                  let contractMethod = contract.contractAPI[call.data.method]
                  if(contractMethod){
                    isReadOnly = contractMethod.type == 'get'
                  }

                  let isExternalFunction = contract.contractAPI[call.data.method]
                  if(!isExternalFunction && !isReadOnly){
                    resolve({error:'Method call is not part of contract API'})
                  }else{
                    let contractState = await this.contractTable.getState(call.data.contractName)
                    if(!contractState) return await this.goThroughStack({error:`Could not find contract state of ${contractName}`, call:call})

                    let initParams = JSON.parse(contract.initParams)
          
                    let method = call.data.method
                    let params = call.data.params

                    let instruction = this.loadInstruction({
                      loadParams:this.loadParams(params),
                      loadCall:this.loadCall(call),
                      loadCallingAccount:this.loadCallingAccount(account),
                      loadInitParams:this.loadInitParams(initParams),
                      loadCurrentState:this.loadCurrentState(contractState),
                      call:call,
                      method:method
                    })

                      let result = await vmInterface(contract.code + instruction)

                      if(result.error){
                        return await this.goThroughStack({error:result.error, call:call})
                      }else{
                        if(isReadOnly){
                          return await this.goThroughStack({isReadOnly:result.value, call:call})
                        }else{
                          let updated = await this.contractTable.updateContractState(call.data.contractName, result.state, call, this.getBlockNumber())
                          if(updated.error) return await this.goThroughStack({error:updated.error, call:call})
                          return await this.goThroughStack({success:result.value, call:call})
                          
                        }
                        
                      }
                  }

                }else{
                  return await this.goThroughStack({error:'Unkown contract name', call:call})
                }
                
              }else{
                return await this.goThroughStack({error:'Unkown account name', call:call})
                
              }
          }catch(e){
            return await this.goThroughStack({error:e.message, call:call})
          }
        }
      }

      
    
}

module.exports = Stack