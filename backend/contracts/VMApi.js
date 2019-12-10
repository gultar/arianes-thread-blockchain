const workerVM = () =>{
    try{
        const ContractVM = require('./ContractVM.js')
        let vm = new ContractVM()

        vm.signals.on('commited', (result)=>{
            vm.sandbox.stateStorage = result.state
            if(result.error) process.send({error:result.error.message, hash:result.hash, contractName:result.contractName})
            else process.send({executed:result, hash:result.hash, contractName:result.contractName})
        })

        vm.signals.on('failed', (failure)=>{
            process.send({error:e, hash:failure.hash, contractName:failure.contractName})
        })

        process.on('message', async(message)=>{
            if(message.code){
                
                
                vm.codes[message.hash] = {
                    code:message.code,
                    contractName:message.contractName,
                    methodToRun:message.methodToRun
                }
                
                vm.run(message.hash)

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
    

    }catch(e){
        process.send({error:e, hash:message.hash, contractName:message.contractName})
    }
}

workerVM()