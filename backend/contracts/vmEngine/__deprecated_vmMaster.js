const EventEmitter = require('events')



const vmMaster = ({ codes, timeLimit, memoryLimit, contractConnector, updateState }) =>{
    return new Promise(async (resolve)=> {
        let pushResult = new EventEmitter()
        let timer
        let results = {}
        let calls = {}
        let readOnlyCalls = {}

        const createTimer = (time) =>{
            console.log('Setting timer for ', time + 250)
            timer = setTimeout(()=>{
                pushResult.emit('callResult',{timeout:'VM Timed out'})
                child.kill()
            }, 250 + time) //
        }
        
        let child = require('child_process').fork(`./backend/contracts/vmEngine/workerVM.js`,{
            execArgv: [`--max-old-space-size=${ typeof memoryLimit == 'number' ? memoryLimit.toString() : memoryLimit }`],
            //silent:true
        })
        
        if(codes){

            
            for await(let contractName of Object.keys(codes)){
                if(contractName !== 'totalCalls'){
                    // let state = codes[contractName].state
                    let contract = codes[contractName].contract
                    if(contract){ //state && 
                        // child.send({nextState:state})
                        child.send({contractCode:contract.code, contractName:contractName}) 
                        calls = codes[contractName].calls
                    }else{
                        //Need to change the way I handle too many transaction calls
                        child.kill()
                    }
                } 
            }
            for await(let hash of Object.keys(calls)){
                
                let code = calls[hash].code
                let contractName = calls[hash].contractName
                let methodToRun = calls[hash].methodToRun
                let isReadOnly = calls[hash].isReadOnly
                if(isReadOnly) readOnlyCalls[hash] = true
                child.send({code:code, contractName:contractName, methodToRun:methodToRun, hash:hash})
            }

            
            createTimer(timeLimit)
            
            

        }

        child.on('message', async (message)=>{
            if(message.executed){

                results[message.hash] = {
                    executed:message.executed,
                    contractName:message.contractName
                }
                pushResult.emit('callResult', {
                    executed:message.executed,
                    contractName:message.contractName,
                    hash:message.hash
                })

                if(!readOnlyCalls[message.hash] && updateState){
                    let updated = await contractConnector.updateState({
                        name:message.contractName,
                        newState:message.executed.state,
                        call:message.hash
                    })
                    if(updated.ok){
                        // console.log('updated successfully')
                    }else if(updated.error){
                        // console.log(JSON.stringify(updated.error, null, 2))
                    }
                }

            }else if(message.getState){
                
                let state = await contractConnector.getState(message.getState);
                if(state){
                    if(state.error) child.send({ state:null })
                    else{
                        child.send({ state:state })
                    }
                }else{
                    child.send({ state:null })
                }
            }else if(message.error){
                console.log('VM ERROR:',message)
                child.kill()
                clearTimeout(timer)
                pushResult.emit('callResult',{error:message})
            }else{
                console.log('Message:', message)
                child.kill()
                clearTimeout(timer)
                pushResult.emit('callResult',{error:'VM ERROR: Invalid VM response message'})
            }
        })

        child.on('error', function(data) {
            console.log('stderr: ' + data);
            clearTimeout(timer)
            pushResult.emit('callResult',{error:'A VM error occurred'})
        });

        child.on('close', function(code, signal) { })
        
        // child.stdout.on('data', (data)=>{
        //     console.log(data.toString())
        // })
        

        // child.stderr.on('data', (data)=>{
        //     console.log('ERR', data.toString())
        //     pushResult.emit('callResult',{error:'VM ran out of memory'})
        // })
        
        resolve(pushResult)


    })
    
    
}



module.exports = vmMaster;