

const vmMaster = ({ codes, isDeployment }) =>{
    return new Promise(async (resolve)=> {
        
        let calls = {}
        let results = {}
        let lifeCycles = 0
        let limitLifeCycles = 20 // 
        let pingCounter = 0;
        let child = require('child_process').fork(`./backend/contracts/build/workerVM.js`,{
            execArgv: ['--max-old-space-size=128']  
        })
        let keepAlive = setInterval(()=>{
            lifeCycles++
            pingCounter++;
            if(lifeCycles >= limitLifeCycles && pingCounter > 20){
                child.kill()
                clearInterval(keepAlive)
                if(Object.keys(results).length > 0){
                    child.kill()
                    resolve(results)
                }else{
                    resolve({error:'VM ERROR: VM finished its lifecycle'})
                }
            }
        }, 50)
        child.on('message', (message)=>{
            if(message.executed){
                pingCounter = 0;
                results[message.hash] = {
                    executed:message.executed,
                    contractName:message.contractName
                }
            }else if(message.deployed){
                
                child.kill()
                clearInterval(keepAlive)
                resolve({deployed:message.deployed, contractName:message.contractName})
            }else if(message.error){
                console.log(message)
                child.kill()
                clearInterval(keepAlive)
                resolve({error:message.error})
            }else{
                child.kill()
                clearInterval(keepAlive)
                resolve({error:'VM ERROR: Invalid VM response message'})
            }
        })

        child.on('error', function(data) {
            console.log('stderr: ' + data);
            clearInterval(keepAlive)
            resolve({error:'A VM error occurred'})
        });
        child.on('close', function() { clearInterval(keepAlive) })
        
        if(codes){
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
        }else if(isDeployment){
            let contract = isDeployment.contract;
            if(!contract) resolve({error:'Cannot deploy unknown contract'})
            
            child.send({ contractToDeploy: contract })
        }



    })
    
    
}

module.exports = vmMaster;