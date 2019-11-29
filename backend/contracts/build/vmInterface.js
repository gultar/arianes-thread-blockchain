

const vmInterface = (code, options) =>{
    return new Promise((resolve)=> {

        if(code){
            let fs = require('fs')
            let child = require('child_process').fork(`./backend/contracts/build/workerVM.js`,{
                execArgv: ['--max-old-space-size=128']  
            })
            
            
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
            let keepAlive = setInterval(()=>{
                lifeCycles++
                if(lifeCycles >= limitLifeCycles){
                    child.kill()
                    clearInterval(keepAlive)
                    resolve({error:'VM ERROR: VM finished its lifecycle'})
                }
            }, 50)
        }else{
            console.log('ERROR: Missing required code parameter')
        }
    })
    
    
}

module.exports = vmInterface;