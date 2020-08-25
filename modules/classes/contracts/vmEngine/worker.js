const { parentPort, workerData } = require('worker_threads')
const ContractVM = require('./ContractVM')

const runContractVM = async () =>{

    let vm = new ContractVM()

    vm.signals.on('saved', (state)=> vm.sandbox.stateStorage = state)
    vm.signals.on('saveState', ({ state, contractName })=> vm.sandbox.contractStates[contractName] = state)
    vm.signals.on('failed', (failure)=> parentPort.postMessage({error:failure.error, hash:failure.hash}))
    vm.signals.on('getState', (contractName)=> parentPort.postMessage({ getState:contractName }))
    vm.signals.on('getContract', (contractName)=> parentPort.postMessage({ getContract:contractName }))
    vm.signals.on('getAccount', (reference)=> parentPort.postMessage({ getAccount:reference.name, contractName:reference.contractName }))
    vm.signals.on('getCurrentBlock', ()=> parentPort.postMessage({ getCurrentBlock:true }))
    vm.signals.on('deferContractAction', (contractAction)=> parentPort.postMessage({ deferContractAction:JSON.stringify(contractAction) }))
    vm.signals.on('deferPayable', (payable)=> parentPort.postMessage({ deferPayable:JSON.stringify(payable) }))
    vm.signals.on('emitContractAction', (contractAction)=> parentPort.postMessage({ emitContractAction:JSON.stringify(contractAction) }))
    vm.signals.on('emitPayable', (payable)=> parentPort.postMessage({ emitPayable:JSON.stringify(payable) }))
    vm.signals.on('getBalance', (accountName)=> parentPort.postMessage({ getBalance:accountName }))
    
    const log = (...message) =>{
        parentPort.postMessage({ log:[...message] })
    }
    
    parentPort.on('message', async (message)=>{
    
            if(message.run){
    
                try{
                    let result = await vm.run(message.run)
    
                    let resultString = JSON.stringify(result)
                    parentPort.postMessage({singleResult:resultString})
                
                }catch(e){
                    console.log('Caught in workerVM', e)
                    parentPort.postMessage({error:e, hash:message.hash, contractName:message.contractName})
                }
    
            }else if(message.error){
                parentPort.postMessage({ error:message.error, hash:message.hash, contractName:message.contractName })
            }else if(message.setState){
                try{
                    if(typeof message.setState == 'object' && message.contractName){
                
                        let stateSet = await vm.setState(message.setState, message.contractName)
                        if(stateSet.error) parentPort.postMessage({error:stateSet.error, contractName:message.contractName })
                        
                    }else{
                        parentPort.postMessage({error:'ERROR: Must provide state of type object and contract name', contractName:message.contractName})
                    }
                }catch(e){
                    console.log('Caught in workerVM', e)
                    parentPort.postMessage({error:e.message, hash:message.hash, contractName:message.contractName})
                }
                
    
            }else if(message.contractCode){
                try{
                    let { contractName, contractCode } = message;
                    if(contractName && contractCode){
                        await vm.setContractClass(contractName, contractCode)
                    }else{
                        parentPort.postMessage({error:'ERROR: Must provide contractName and contractCode', hash:message.hash, contractName:message.contractName})
                    }
                }catch(e){
                    console.log('Caught in workerVM', e)
                    parentPort.postMessage({error:e.message, hash:message.hash, contractName:message.contractName})
                }
                
    
            }else if(message.initContract){
                try{
                    
                    let { contract, contractName, state } = message.initContract;
                    if(contractName && contract && state && Object.keys(state).length > 0){
                        let classSet = await vm.setContractClass(contractName, contractCode)
                        let stateSet = await vm.setState(state, contractName)
                        console.log('Set state success', stateSet)
                        if(stateSet.error) parentPort.postMessage({error:stateSet.error, contractName:contractName })
                    }else{
                        parentPort.postMessage({error:'ERROR: Must provide contractName, contractCode and contractState', hash:message.hash, contractName:message.contractName})
                    }
                }catch(e){
                    console.log('Caught in workerVM', e)
                    parentPort.postMessage({error:e.message, hash:message.hash, contractName:message.contractName})
                }
                
    
            }else if(message.state) vm.signals.emit('state', message.state)
            else if(message.currentBlock) vm.signals.emit('currentBlock', message.currentBlock)
            else if(message.contract) vm.signals.emit('contract', message.contract)
            else if(message.account) vm.signals.emit('account', message.account)
            else if(message.deferred) vm.signals.emit('deferred', message.deferred)
            else if(message.emitted) vm.signals.emit('emitted', message.emitted)
            else if(message.balance) vm.signals.emit('balance', message.balance)
            else if(message.ping) parentPort.postMessage({pong:true})
    })
}

runContractVM()