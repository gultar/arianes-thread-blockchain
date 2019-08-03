const callRemoteVM = (code) =>{
    return new Promise((resolve)=> {
        if(code){
            let fs = require('fs')
            let child = require('child_process').fork(`./backend/contracts/build/launchRemoteVM.js`)
    
            let memLimit = 1000 //Determine a ram limit with parameters

            let pingCounter = 0
            child.send({code:code})
    
            let keepAlive = setInterval(()=>{
                child.send('getMemUsage')
                child.send('ping')
                pingCounter++;
                if(pingCounter > 20){
                    console.log('Aborting process');
                    child.kill()
                    clearInterval(keepAlive)
                } 
            }, 100)
    
            child.on('message', (message)=>{
                let type = typeof message
                switch(type){
                    case'object':
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
                            console.log({used:message.memUsage.heapUsed})
                        }else{
                            child.kill()
                            clearInterval(keepAlive)
                            resolve({error:'VM ERROR: Invalid VM response message'})
                        }
                        
                        break;
                    case 'string':
                            //Catch memusage
                            pingCounter = 0;
                        break
                    
                }
            })
            child.on('error', function(data) {
                console.log('stderr: ' + data);
                clearInterval(keepAlive)
                resolve({error:'A VM error occurred'})
            });
            child.on('close', function() { 
                console.log('Process killed')
            })
        }else{
            console.log('ERROR: Missing required code parameter')
        }
    })
    
    
}

module.exports = callRemoteVM;