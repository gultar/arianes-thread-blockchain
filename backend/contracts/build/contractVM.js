const { VM, VMScript, NodeVM } = require('vm2');
const Contract = require('../toolbox/contract')
const Coin = require('../toolbox/coin')

class ContractVM{
    constructor(){
        this.parameters = {
            timeout:5000,
            sandbox: {
              console: {
                log: function(str) { console.log(str); }
              },
              Coin:Coin,
              Contract:Contract
            },
            wasm:true    
          }
        this.vm = new VM(this.parameters);
        this.scripts = {}
    }

    buildScript(name, codeString){
        return new Promise((resolve, reject)=>{
            if(codeString && typeof codeString == 'string'){
                let script = new VMScript(codeString);
                this.scripts[name] = codeString;
                resolve(this.scripts[name])
            }else{
                resolve(false)
            }
        })
       
    }

    initVM(){
        if(process){
            process.on('message', async(message)=>{
                try{
                  let type = typeof message
                  switch(type){
                    case 'object':
                      if(message.contract){
                          if(message.contract.name && message.contract.code){
                            this.buildScript(message.contract.name, message.contract.code)
                            .then( script =>{
                                if(script){
                                    this.runScript(message.contract.name)
                                }
                            })
                            
                            process.send({data:result})
                          }else{
                              console.log('ERROR: Need to provide a name and the smart contract code')
                              process.send({error:'ERROR: Need to provide a name and the smart contract code'})
                          }
                        
                      }else if(message.error){
                          console.log(error);
                          process.exit()
                      }else{
                        process.send({error:'ERROR: Invalid data format provided'})
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
        }else{
            console.log('ERROR: Need to run as a child process')
        }
       
    }

    validateScript(){

    }

    runScript(name){
        if(this.scripts[name]){
            try{
                this.vm.run(this.scripts[name])
            }catch(e){
                console.log(e)
            }
        }
       
    }

    ipcInterface(){

    }
}




let vm = new VM({
  timeout:5000,
  sandbox: {
    console: {
      log: function(str) { console.log(str); }
    },
    Address: Address,
    Contract: Contract,
    

  }    
})

let vm2 = new NodeVM({
  sandbox: {
    console: {
      log: function(str) { console.log(str); }
    },
    Address: Address,
    Contract: Contract,
    

  }    
})

module.exports = ContractVM


// console.log(code.toString())
// console.log(vm);


