const launchVM = () =>{
    // const ContractVM = require('./contractVM')
    // const Sandbox = require('./sandbox')
    const ContractVM = require('../VM.js')
    const fs = require('fs')
  

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
                  vm.compileScript()
                  vm.run()
                  .then((result)=>{
                      process.send({executed:result})
                  })
                }catch(e){
                  console.log(e)
                }
              }else{
                process.send({error:'ERROR: Invalid data format provided'})
              }
              break;
            case 'string':
              process.send('pong')
              break
            
          }
        }catch(e){
          process.send({error:e.toString()})
        }
        
      })

}

launchVM()