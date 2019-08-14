

const callRemoteVM = (code) =>{
    return new Promise((resolve)=> {

        

        if(code){
            let fs = require('fs')
            let child = require('child_process').fork(`./backend/contracts/build/launchRemoteVM.js`)
            child.send('getInitialMemUsage')
            
            let pingCounter = 0
            child.send({code:code})

            let keepAlive = setInterval(()=>{
                    child.send('getMemUsage')
                    pingCounter++;
                    if(pingCounter > 100){
                        console.log('Aborting process');
                        child.kill()
                        clearInterval(keepAlive)
                        resolve({error:'VM ERROR: VM Timed out'})
                    } 
            }, 20)
    
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
                    // console.log(message)
                    pingCounter = 0;
                }else if(message.initialMemUsage){
                    let initialVMMemoryUsage = message.initialMemUsage
                    // console.log(message)
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
        }else{
            console.log('ERROR: Missing required code parameter')
        }
    })
    
    
}

module.exports = callRemoteVM;