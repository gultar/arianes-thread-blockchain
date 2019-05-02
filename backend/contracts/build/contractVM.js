const { VM, VMScript } = require('vm2')
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
        if(codeString && typeof codeString == 'string'){
            let script = new VMScript(codeString);
            this.scripts[name] = codeString;
            
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

let vm = new ContractVM();

let code = `
let coin = new Coin('BOB', 1000*1000*1000*1000, 'john'); 
console.log(coin.getSupply()); 
coin.issue(8000000, 'john', 'jack')
console.log(coin.getSupply());`;
vm.buildScript('test', code);
vm.runScript('test')
