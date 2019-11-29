

const callRemoteVM = (code, options) =>{
    return new Promise((resolve)=> {
        // let { setLifeCycles } = options;
        

        if(code){
            let fs = require('fs')
            let child = require('child_process').fork(`./backend/contracts/build/launchRemoteVM.js`,{
                execArgv: ['--max-old-space-size=128']  
            })
            
            child.send('getInitialMemUsage')
            
            let pingCounter = 0
            let lifeCycles = 0
            let limitLifeCycles = 30 // 
            child.send({code:code})

            child.on('message', (message)=>{
                if(message.executed){
                    child.kill()
                    clearInterval(keepAlive)
                    resolve(message.executed)
                }else if(message.error){
                    console.log(message.error)
                    child.kill()
                    clearInterval(keepAlive)
                    resolve({error:message.error})
                }else if(message.memUsage){
                    pingCounter = 0;
                }else if(message.initialMemUsage){
                    let initialVMMemoryUsage = message.initialMemUsage
                    pingCounter = 0;
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
            child.on('close', function() { 
            
            })
            let keepAlive = setInterval(()=>{
                child.send('getMemUsage')
                pingCounter++;
                lifeCycles++
                if(lifeCycles >= limitLifeCycles){
                    child.kill()
                    resolve({error:'VM ERROR: VM finished its lifecycle'})
                }

                if(pingCounter >= 20){
                    child.kill()
                    clearInterval(keepAlive)
                    resolve({error:'VM ERROR: VM Timed out'})
                } 
            }, 50)
        }else{
            console.log('ERROR: Missing required code parameter')
        }
    })
    
    
}

module.exports = callRemoteVM;