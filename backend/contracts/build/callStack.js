
let EventEmitter = require('events')
class ExecutionSignal extends EventEmitter{
  constructor(){
    super()
  }
}

class Stack{
    constructor({ contractTable, accountTable, getBlockNumber }){
        this.stack = []
        this.queue = {}
        this.contractTable = contractTable
        this.accountTable = accountTable
        this.getBlockNumber = getBlockNumber
        this.resultEvents = new ExecutionSignal()
        this.resultPayload = {}
    }

    // addNewCall(call){
        
    //     this.stack.unshift(call)
    //     return true;
    // }

    addCall(call, contractName){
        let name = contractName ? contractName : call.data.contractName
        if(!this.queue[name]) this.queue[name] = []

        this.queue[contractName].unshift(call)
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

    //Trying to build a new way to execute calls in bunches

    // convertParams(params, hash){
    //   return `
    //   let ${hash}ParamString = '${JSON.stringify(params)}'
    //   let ${hash}Params = JSON.parse(${hash}ParamString)
    //   `
    // }

    // convertAccount(account){
    //   return `
    //   let ${account.name}String = '${JSON.stringify(account)}'
    //   let ${account.name} = JSON.parse(${account.name}String)
    //   `
    // }
    
    // convertCall(call){
    //   return `
    //   let ${call.hash}ActionString = '${JSON.stringify(call)}'
    //   let ${call.hash}Action = JSON.parse(${call.hash}ActionString);
    //   ${hash}Params.callingAction = ${call.hash}Action
    //   `
    // }

    // convertMethod(call, method){
    //   return `
    //   result['${call.hash}'] = await instance['${method}'](${call.hash}Params, ${call.fromAccount})
    //   `
    // }

    // createVMCode(call, account){
    //   let code = ``


    // }

    // loadCurrentState(contractState){
    //   return `
    //   let currentStateString = '${JSON.stringify(contractState)}'
    //   let currentState = JSON.parse(currentStateString)
    //   await instance.setState(currentState)
    //   `
    // }

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



    // loadInstruction({ 
    //   loadParams, 
    //   loadCall, 
    //   loadCallingAccount, 
    //   loadInitParams,
    //   loadCurrentState,  
    //   call, 
    //   method }){

    //   let instruction = 
    //   `
    //     let failure = ''
    //     let fail = require('fail')

    //     async function execute(){
    //       let instance = {};
          
    //       try{
    //         const commit = require('commit')
    //         const save = require('save')
            
    //         ${loadParams}
    //         ${loadCall}
    //         ${loadCallingAccount}
    //         ${loadInitParams}
    //         instance = new ${call.data.contractName}(initParams)
    //         ${loadCurrentState}
    //         let result = await instance['${method}'](params, callerAccount)
    //         save(instance.state)
    //         commit(result)
            
            
    //       }catch(err){
    //         failure = err
    //       }
            
          
    //     }

    //     execute()
    //     .then(()=>{
    //       if(failure) throw new Error(failure.message)
    //       fail(e)
    //     })
    //     .catch((e)=>{
    //       fail(e)
    //     })
        
    //   `
    //   return instruction
    
    
    // }

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
                 //Method does not exist
                 console.log('Method does not exist')
               }
             }else{
               console.log('Sending account could not be found')
             }
             
           }
         }else{
           return { error:`No calls to process in stack` }
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

    //  async  createCode(){
    //    let errors = {}
    //    let contractNames = Object.keys(this.queue)
    //    let codes = {}
       
    //    if(contractNames.length == 0){
    //     return false
    //    }else{
    //      //Load contract states
    //     for await(let contractName of contractNames){
    //       let contract = await this.contractTable.getContract(contractName)
    //       if(contract){
    //       codes[contractName] = {
    //         contract:contract,
    //         calls:{}
    //       }
    //       let contractState = await this.contractTable.getState(contractName)
    //       if(contractState){
    //         codes[contractName].state = contractState
    //         let calls = this.queue[contractName]
    //         if(calls){
    //           for await(let call of calls){
    //             let account = await this.accountTable.getAccount(call.fromAccount)
    //             if(account){
    //               let hash = call.hash
    //               let method = contract.contractAPI[call.data.method]
    //               if(method){
    //                 let initParams = JSON.parse(contract.initParams)
                      
    //                   codes[contractName].calls[hash] = {
    //                     code:this.buildInstance({
    //                       loadParams:this.loadParams(call.data.params),
    //                       loadCall:this.loadCall(call),
    //                       loadCallingAccount:this.loadCallingAccount(account),
    //                       loadInitParams:this.loadInitParams(initParams),
    //                       call:call,
    //                       method:call.data.method,
    //                       memory:call.data.memory,
    //                       cpuTime:call.data.cpuTime
    //                     }),
    //                     isReadOnly:(method.type === 'get' ? true : false),
    //                     methodToRun:`let result = await instance['${call.data.method}'](params, callerAccount)`,
    //                     contractName:contractName
    //                   }
                      
    //                   codes.totalCalls++
                    
    //               }else{
    //                 //Method does not exist
    //                 console.log('Method does not exist')
    //               }
    //             }else{
    //               console.log('Sending account could not be found')
    //             }
                
    //           }
    //         }else{
    //           return { error:`No calls to process in stack` }
    //         }
    //       }else{
    //         errors[contractName] = `Could not find state of contract ${contractName}`
    //       }
    //       }else if(contract.error){
    //       errors[contractName] = contract.error
    //       }else if(!contract){
    //       errors[contractName] = `Contract name ${contractName} unknown`
    //       }
    //     }

    //     this.queue = {}
    //     if(Object.keys(errors).length > 0) return {error:errors}
    //     else return codes
    //    }

      
       
    // }

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
                hash:call.hash,
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

module.exports = Stack