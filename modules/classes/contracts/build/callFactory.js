
let EventEmitter = require('events')
class ExecutionSignal extends EventEmitter{
  constructor(){
    super()
  }
}
let { accountTable } = require('../../../instances/tables')

class Factory{
    constructor({ contractTable, getBlockNumber }){
        this.factory = []
        this.queue = {}
        this.contractTable = contractTable
        this.accountTable = accountTable
        this.getBlockNumber = getBlockNumber
        this.resultEvents = new ExecutionSignal()
        this.resultPayload = {}
    }

    addCall(call, contractName){
        let name = contractName ? contractName : call.data.contractName
        if(!this.queue[name]) this.queue[name] = []

        this.queue[contractName].unshift(call)
        return true;
    }

    

    loadParams(params){
      return `
      let paramsString = '${JSON.stringify(params)}'
      let params = JSON.parse(paramsString)
      `
    }

    loadCall(call){
      return `
      let actionString = '${JSON.stringify(call)}'
      let action = JSON.parse(actionString);
      params.callingAction = action
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

    loadSingleMethodCall(hash, method){
      return `
      result['${hash}'] = await instance['${method}'](params, callerAccount)
      `
    }

    async loadAllMethodCalls(actions){
      let methodCalls = ``
      for await(let hash of Object.keys(actions)){
        let action = actions[hash]

        methodCalls = methodCalls + this.loadSingleMethodCall(hash, action.data.method)

      }
      return methodCalls;
    }



    buildInstance({ loadParams, loadCall, loadCallingAccount, loadInitParams, call }){
      let instruction = `
      ${loadParams}
      ${loadCall}
      ${loadCallingAccount}
      ${loadInitParams}
      instance = new ${call.data.contractName}(initParams)
      `

      return instruction
    }

    async  buildCode(){
      let errors = {}
      let contractNames = Object.keys(this.queue)
      let codes = {}
      
      if(contractNames.length == 0){
       return false
      }else{
        //Load contract states
       for await(let contractName of contractNames){
         let contract = await this.contractTable.getContract(contractName)
         if(contract){
         codes[contractName] = {
           contract:contract,
           calls:{}
         }
         
         let calls = this.queue[contractName]
         if(calls){
           for await(let call of calls){
             let account = await this.accountTable.getAccount(call.fromAccount)
             if(account){
               let hash = call.hash
               let method = contract.contractAPI[call.data.method]
               if(method){
                 let initParams = JSON.parse(contract.initParams)
                   
                   codes[contractName].calls[hash] = {
                     code:this.buildInstance({
                       loadParams:this.loadParams(call.data.params),
                       loadCall:this.loadCall(call),
                       loadCallingAccount:this.loadCallingAccount(account),
                       loadInitParams:this.loadInitParams(initParams),
                       call:call,
                       method:call.data.method,
                     }),
                     methodToRun:`let result = await instance['${call.data.method}'](params, callerAccount)`,
                     contractName:contractName,
                     memory:call.data.memory,
                     cpuTime:call.data.cpuTime,
                     hash:call.hash,
                   }
                   
                 
               }else{
                 return { error:`Method ${call.data.method} does not exist` }
               }
             }else{
              return { error:`ERROR: Sending account ${call.fromAccount} could not be found` }
               console.log('')
             }
             
           }
         }else{
           return { error:`No calls to process in queue` }
         }

         }else if(contract.error){
         errors[contractName] = contract.error
         }else if(!contract){
         errors[contractName] = `Contract name ${contractName} unknown`
         }
       }

       this.queue = {}
       if(Object.keys(errors).length > 0) return {error:errors}
       else return codes
      }

     
      
   }

    async  createSingleCode(call){
      let errors = {}
      if(call){
        let contract = await this.contractTable.getContract(call.data.contractName)
        if(contract){
          if(contract.error) return { error:contract.error }
                  //validate if valid call
          let account = await this.accountTable.getAccount(call.fromAccount)
          if(account){
            if(account.error) return { error:account.error }
            let hash = call.hash
            let method = contract.contractAPI[call.data.method]
            if(method){
              let initParams = JSON.parse(contract.initParams)

              let code = {
                code:this.buildInstance({
                  loadParams:this.loadParams(call.data.params),
                  loadCall:this.loadCall(call),
                  loadCallingAccount:this.loadCallingAccount(account),
                  loadInitParams:this.loadInitParams(initParams),
                  call:call,
                  method:call.data.method,
                }),
                hash:call.hash,
                isReadOnly:(method.type === 'get' ? true : false),
                methodToRun:`let result = await instance['${call.data.method}'](params, callerAccount)`,
                contractName:call.data.contractName,
                memory:call.data.memory,
                cpuTime:call.data.cpuTime,
              } 

              return code
            }
          }
        }
      }else{
        return { error:'ERROR: Cannot build instruction of empty call' }
      }
      
     

     
      
   }

      
    
}

module.exports = Factory