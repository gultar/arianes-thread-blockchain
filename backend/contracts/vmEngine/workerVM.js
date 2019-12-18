const workerVM = () =>{
  try{
      const ContractVM = require('../vmEngine/ContractVM')
      let vm = new ContractVM()
      
      vm.signals.on('saved', (state)=>{
        vm.sandbox.stateStorage = state
        
      })

      vm.signals.on('saveState', ({ state, contractName })=>{
        // console.log('Saved state:', state.tokens)
        vm.sandbox.contractStates[contractName] = state
      })

      vm.signals.on('commited', (result)=>{
          vm.sandbox.stateStorage = result.state
          vm.sandbox.contractStates[result.contractName] = result.state
          
          if(result.error) process.send({error:result.error.message, hash:result.hash, contractName:result.contractName})
          else process.send({executed:result, hash:result.hash, contractName:result.contractName})
      })

      vm.signals.on('failed', (failure)=>{
        
          process.send({error:failure, hash:failure.hash, contractName:failure.contractName})
      })

      vm.signals.on('getState', (contractName)=>{
        process.send({ getState:contractName })
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
            
            
        }else if(message.run){

          try{
            
            vm.execute(message.run)

          }catch(e){
            process.send({error:e, hash:message.hash, contractName:message.contractName})
          }

        }else if(message.runCode){
          
          try{

            let results = await vm.runManyCalls(message.runCode)
            process.send(results)

          }catch(e){
            process.send({error:e, hash:message.hash, contractName:message.contractName})
          }

        }else if(message.nextState){

          if(typeof message.nextState == 'object' && contractName){
            vm.transferState(message.nextState, contractName)
          }else{
            process.send({error:'ERROR: Must provide state of type object and contract name', hash:message.hash, contractName:message.contractName})
          }

        }else if(message.setState){

            if(typeof message.setState == 'object' && message.contractName){
              
              vm.setState(message.setState, message.contractName)
            }else{
              process.send({error:'ERROR: Must provide state of type object and contract name', hash:message.hash, contractName:message.contractName})
            }

        }else if(message.contractCode){

            let { contractName, contractCode } = message;
            if(contractName && contractCode){
              await vm.setContractClass(message.contractName, message.contractCode)
            }else{
              process.send({error:'ERROR: Must provide contractName and contractCode', hash:message.hash, contractName:message.contractName})
            }

        }else if(message.state){
           vm.signals.emit('state', message.state)
        }else if(message.contract){
           vm.signals.emit('contract', message.contract)
        }else if(message.ping){
           process.send({pong:true})
        }else{
          console.log('Worker Error',message)
           process.send({error:'ERROR: Invalid data format provided', hash:message.hash, contractName:message.contractName})
          
          }
      })
      
      process.on('error', err => process.send({error:err}))
  
      process.on('uncaughtException', (err)=> process.send({error:err}))

  }catch(e){
    console.log('Child process Error: ', e)
      process.send({error:e, hash:'unknown', contractName:'unknown'})
  }
}

workerVM()