const launchVM = () =>{
    // const ContractVM = require('./contractVM')
    // const Sandbox = require('./sandbox')
    const ContractVM = require('../VM.js')
    
    const { getCPUPercent } = require('../../tools/utils');
    
    process.on('message', async(message)=>{
        try{
          let type = typeof message
          switch(type){
            case 'object':
              if(message.code){
                
                try{
                  
                  let vm = new ContractVM({
                    code:message.code,
                    type:'NodeVM'
                  })

                  vm.buildVM()
                  // vm.compileScript()
                  vm.compiled = message.code
                  vm.run()
                  .then((result)=>{  
                      if(result.error) process.send({error:result.error.message})
                      else process.send({executed:result})
                  })
                  .catch((e)=>{
                    process.send({error:e})
                  })
                }catch(e){
                  process.send({error:e})
                }
              }else{
                process.send({error:'ERROR: Invalid data format provided'})
              }
              break;
            case 'string':
              if(message === 'getMemUsage'){
                process.send({memUsage: process.memoryUsage(), cpuUsage:getCPUPercent()});
              }else if(message === 'getInitialMemUsage'){
                process.send({initialMemUsage: process.memoryUsage(), cpuUsage:getCPUPercent()});
              }else{
                process.send('pong')
              }
              
              break
            
          }
        }catch(e){
          process.send({error:e})
        }
        
      })

}

launchVM()