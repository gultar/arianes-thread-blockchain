const callRemoteVM = (code) =>{
    return new Promise((resolve)=> {
        if(code){
            let fs = require('fs')
            let child = require('child_process').fork(`./backend/contracts/build/launchRemoteVM.js`)
    
            let pingCounter = 0
            child.send({code:code})
    
            let keepAlive = setInterval(()=>{
                child.send('ping')
                pingCounter++;
                if(pingCounter > 3){
                    console.log('Aborting process');
                    child.kill()
                    clearInterval(keepAlive)
                } 
            }, 1000)
    
            child.on('message', (message)=>{
                let type = typeof message
                switch(type){
                    case'object':
                        if(message.executed){
                            child.kill()
                            clearInterval(keepAlive)
                            resolve(message.executed)
                        }else if(message.error){
                            child.kill()
                            clearInterval(keepAlive)
                            resolve({error:message.error})
                        }else{
                            child.kill()
                            clearInterval(keepAlive)
                            resolve({error:'VM ERROR: Invalid VM response message'})
                        }
                        
                        break;
                    case 'string':
                            pingCounter = 0;
                        break
                    
                }
            })
            child.on('error', function(data) {
                console.log('stderr: ' + data);
                clearInterval(keepAlive)
                resolve({error:'A VM error occurred'})
            });
            child.on('close', function() { })
        }else{
            console.log('ERROR: Missing required code parameter')
        }
    })
    
    
}

module.exports = callRemoteVM;