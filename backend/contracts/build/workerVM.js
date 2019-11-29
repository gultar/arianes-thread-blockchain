const workerVM = () =>{
    // const ContractVM = require('./contractVM')
    // const Sandbox = require('./sandbox')
    const ContractVM = require('../VM.js')
    
    process.on('message', async(message)=>{
        try{
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
        }catch(e){
          process.send({error:e})
        }
        
      })

}

workerVM()