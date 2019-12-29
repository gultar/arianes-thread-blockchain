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
          process.send({error:failure, hash:failure.hash})
      })

      vm.signals.on('getState', (contractName)=>{
        process.send({ getState:contractName })
      })

      vm.signals.on('getContract', (contractName)=>{
        process.send({ getContract:contractName })
      })

      vm.signals.on('getAccount', (name)=>{
        process.send({ getAccount:name })
      })

      process.on('message', async(message)=>{
        if(message.run){

          try{
            
            let result = await vm.run(message.run)
            process.send({singleResult:result})
            
          }catch(e){
            console.log('Caught in workerVM', e)
            process.send({error:e, hash:message.hash, contractName:message.contractName})
          }

        }else if(message.runCode){
          
          try{

            let results = await vm.runManyCalls(message.runCode)
            process.send(results)
            // for await(let call of message.runCode){
            //   let result = await vm.run(call)
            //   console.log('VM Result', result)
            //   process.send({singleResult:result})
            // }
            // process.send({singleResult:{ finished }})

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
              
              let stateSet = await vm.setState(message.setState, message.contractName)
              if(stateSet.error) process.send({error:stateSet.error, contractName:message.contractName })
              
            }else{
              process.send({error:'ERROR: Must provide state of type object and contract name', contractName:message.contractName})
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
        }else if(message.account){
           vm.signals.emit('account', message.account)
        }else if(message.ping){
           process.send({pong:true})
        }else{
          console.log('Worker Error',message)
           process.send({error:'ERROR: Invalid data format provided', hash:message.hash, contractName:message.contractName})
          
          }
      })
      
      process.on('error', err => {
        process.send({error:err})
      })
  
      process.on('uncaughtException', (err)=> process.send({error:err}))

  }catch(e){
    console.log('Child process Error: ', e)
      process.send({error:e, hash:'unknown', contractName:'unknown'})
  }
}

workerVM()