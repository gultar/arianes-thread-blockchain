const workerVM = () =>{
  
    const ContractVM = require('../VM.js')
    let vm = new ContractVM()
    process.on('message', async(message)=>{
      if(message.code){
        try{
          
          vm.codes[message.hash] = {
            code:message.code,
            contractName:message.contractName,
            methodToRun:message.methodToRun
          }
          
          vm.runCode(message.state, message.hash)
          .then((result)=>{
              vm.sandbox.stateStorage = result.state
              if(result.error) process.send({error:result.error.message, hash:message.hash, contractName:message.contractName})
              else process.send({executed:result, hash:message.hash, contractName:message.contractName})
          })
          .catch((e)=>{
            console.log('VM Child ERROR',e)
            process.send({error:e, hash:message.hash, contractName:message.contractName})
          })
        }catch(e){
          console.log('VM Child ERROR',e)
          process.send({error:e, hash:message.hash, contractName:message.contractName})
        }

      }else if(message.contractToDeploy){

        if(typeof message.contractToDeploy == 'object'){
          let contract = message.contractToDeploy.contract;
          let contractName = contract.name;
          let contractCode = contract.code;
          let initParams = contract.initParams;

          let contractAdded = await vm.setContractClass(contractName, contractCode)
          if(contractAdded.error) process.send({error:contractAdded.error, contractName:contractName})

          let contractIsValid = await vm.deployContract(contractName, initParams)
          if(contractIsValid.error) process.send({error:contractIsValid.error, contractName:contractName})

          process.send({ deployed:contractIsValid, contractName:contractName })

        }else{
          process.send({error:'ERROR: Must provide state of type object', hash:message.hash, contractName:message.contractName})
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

}

workerVM()