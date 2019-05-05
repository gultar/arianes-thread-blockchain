const launchVM = () =>{
    const { VMScript, VM, NodeVM } = require('vm2');
    const Contract = require('../toolbox/contract')
    const Coin = require('../toolbox/coin')
    const fs = require('fs')

    let vm = new VM({
        sandbox: {
            console: {
            log: function(str) { console.log(str); }
            },
            Coin:Coin,
            Contract:Contract,
            returns: (output)=>{ console.log(output) }
        }    
    })

    let vm2 = new NodeVM({
      sandbox: {
          console: {
          log: function(str) { console.log(str); }
          },
          Coin:Coin,
          Contract:Contract,
          Error:class Error{
            constructor(str){
              console.log(str)
            }
          }
      }    
  })


    process.on('message', async(message, code)=>{
        try{
          let type = typeof message
          switch(type){
            case 'object':
              if(message.code){
                const script = new VMScript(message.code);
                
                let output = await vm2.run(script)
                process.send({data:output})
              }else{
                process.send('ERROR: Invalid data format provided')
              }
              break;
            case 'string':
              console.log(message)
              process.send('pong')
              break
            
          }
        }catch(e){
          process.send({error:e})
        }
        
      })

}

launchVM()