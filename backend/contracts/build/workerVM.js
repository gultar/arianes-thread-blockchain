const workerVM = () =>{
  try{
      const ContractVM = require('../ContractVM.js')
      let vm = new ContractVM()

      vm.signals.on('saved', (state)=>{
        vm.sandbox.stateStorage = state
      })

      vm.signals.on('commited', (result)=>{
          vm.sandbox.stateStorage = result.state
          if(result.error) process.send({error:result.error.message, hash:result.hash, contractName:result.contractName})
          else process.send({executed:result, hash:vm.sandbox.stateStorage, contractName:result.contractName})
      })

      vm.signals.on('failed', (failure)=>{
        
          process.send({error:failure, hash:failure.hash, contractName:failure.contractName})
      })

      process.on('message', async(message)=>{
          if(message.code){
              
              try{
                
                vm.codes[message.hash] = {
                    code:message.code,
                    contractName:message.contractName,
                    methodToRun:message.methodToRun
                }
                
                vm.run(message.hash)

              }catch(e){
                process.send({error:e, hash:message.hash, contractName:message.contractName})
              }
              
              
          }else if(message.nextState){

              if(typeof message.nextState == 'object'){
                vm.transferState(message.nextState)
              }else{
                process.send({error:'ERROR: Must provide state of type object', hash:message.hash, contractName:message.contractName})
              }

          }else if(message.contractCode){

              let { contractName, contractCode } = message;
              if(contractName && contractCode){
                vm.setContractClass(message.contractName, message.contractCode)
              }else{
                process.send({error:'ERROR: Must provide contractName and contractCode', hash:message.hash, contractName:message.contractName})
              }

          }else{
              
              process.send({error:'ERROR: Invalid data format provided', hash:message.hash, contractName:message.contractName})
          
          }
      })
  
      process.on('uncaughtException', (err)=>{
        process.send({error:err})
      })

  }catch(e){
      process.send({error:e, hash:'unknown', contractName:'unknown'})
  }
}

workerVM()