const launchVM = () =>{
    // const ContractVM = require('./contractVM')
    // const Sandbox = require('./sandbox')
    const VM = require('../VM.js/index.js.js')
    const fs = require('fs')
  

    process.on('message', async(message)=>{
        try{
          let type = typeof message
          switch(type){
            case 'object':
              if(message.code){
                
                try{
                  let vm = new VM({
                    code:message.code,
                    type:'NodeVM'
                  })

                  vm.buildVM()
                  vm.compileScript()
                  vm.run()
                  console.log(vm.result)

                  // let vm = new ContractVM({
                  //   ramLimit: 128,
                  //   logging: true,
                  // });
                  // let state = {
                  //   deploy:true
                  // }
                  // vm.setTimingLimits(1000);
                  // vm.setCpuLimit(1000);
                  // vm.compileScript(message.code, state);
                  // vm.setState(state);
                  // vm.execute();
                  
                  // state.deploy = false;
                }catch(e){
                  console.log(e)
                }
                // process.send({data:output})
              }else{
                process.send('ERROR: Invalid data format provided')
              }
              break;
            case 'string':
              // console.log(message)
              process.send('pong')
              break
            
          }
        }catch(e){
          process.send({error:e.toString()})
        }
        
      })

}

launchVM()