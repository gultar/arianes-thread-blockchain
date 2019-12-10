const EventEmitter = require('events')



const vmMaster = ({ codes, timeLimit, memoryLimit }) =>{
    return new Promise(async (resolve)=> {
        let pushResult = new EventEmitter()
        let timer
        let results = {}
        const createTimer = (time) =>{
            timer = setTimeout(()=>{
                pushResult.emit('callResult',{end:'VM Timed out'})
                child.kill()
            }, time) //(time >= 500 ? time : 500)
        }
        
        let calls = {}
        
        let child = require('child_process').fork(`./backend/contracts/build/workerVM.js`,{
            execArgv: [`--max-old-space-size=${typeof memoryLimit == 'number' ? memoryLimit.toString() : '256' }`],
            silent:true
            // stdio:[0, 1, 2, 'ipc'] //
        })
        
        if(codes){

            createTimer(timeLimit)

            for await(let contractName of Object.keys(codes)){
                if(contractName !== 'totalCalls'){
                    let state = codes[contractName].state
                    let contract = codes[contractName].contract
                    if(state && contract){
                        child.send({nextState:state})
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
                
                child.send({code:code, contractName:contractName, methodToRun:methodToRun, hash:hash})
            }
            
            

        }

        child.on('message', (message)=>{
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

                if(Object.keys(results).length >= Object.keys(calls).length){
                    pushResult.emit('callResult', {end:'Execution complete'})
                    clearTimeout(timer)
                    child.kill()
                }

            }else if(message.error){
                console.log('VM ERROR:',message)
                child.kill()
                clearTimeout(timer)
                pushResult.emit('callResult',message)
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
        
        child.stdout.on('data', (data)=>{
            console.log(data.toString())
        })

        child.stderr.on('data', (data)=>{
            pushResult.emit('callResult',{error:'VM ran out of memory'})
        })
        
        child.on('uncaughtException', ()=>{
            console.log('VM ran out of memory')
        })
        
        resolve(pushResult)


    })
    
    
}



module.exports = vmMaster;