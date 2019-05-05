const callRemoteVM = (code) =>{
    if(code){
        let fs = require('fs')
        let child = require('child_process').fork(`./backend/contracts/build/launchRemoteVM.js`)

        let pingCounter = 0
        child.send({code:code})

        let keepAlive = setInterval(()=>{
            child.send('ping')
            pingCounter++;
            if(pingCounter > 5){
                console.log('Aborting process');
                child.kill()
                clearInterval(keepAlive)
            } 
        }, 1000)

        child.on('message', (message)=>{
            let type = typeof message
            switch(type){
                case'object':
                    if(message.data){
                        console.log(message)
                        
                        child.kill()
                        clearInterval(keepAlive)
                    }else if(message.error){
                        console.log(message.error)
                        child.kill()
                        clearInterval(keepAlive)
                    }
                    
                    break;
                case 'string':
                        console.log(message)
                        pingCounter = 0;
                    break
                
            }
        })
        child.on('error', function(data) {
            console.log('stderr: ' + data);
            clearInterval(keepAlive)
        });
        child.on('close', function() {
            console.log('Child process closed')
        })
    }else{
        console.log('ERROR: Missing required code parameter')
    }
    
}

module.exports = callRemoteVM;