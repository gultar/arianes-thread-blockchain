const { VM, VMScript, NodeVM } = require('vm2');
const deploy = require('./toolbox/contractTools')
let _ = require('private-parts').createKey();
const Permissions = require('./build/permissions');
const Account = require('../classes/account');
const Wallet = require('../classes/wallet');
// const Transaction = require('../classes/transaction')
const Action = require('../classes/action')
const ContractAction = require('../classes/contractAction')
const createContractInterface = require('./toolbox/contractInterface')
const makeExternal = require('./toolbox/makeExternal')
const getFunctionArguments = require('get-function-arguments')
const fs = require('fs')
const EventEmitter = require('events')


class Signals extends EventEmitter{
    constructor(){
        super()
    }
}

let code = fs.readFileSync(__dirname+'/toolbox/token.js').toString()
let iface = {}
let stateStorage = {}
let signals = new Signals()

class Sandbox{
    constructor(){
        this.iface = {}
        this.stateStorage  = {}
        this.context = {
            require:{
                external: true, 
                builtin: [], 
                root: "./", 
                mock: {
                    "Wallet":Wallet,
                    "Account":Account,
                    "Action":Action,
                    "ContractAction":ContractAction,
                    "Permissions":Permissions,
                    "createContractInterface":createContractInterface,
                    "makeExternal":makeExternal,
                    "getFunctionArguments":getFunctionArguments,
                    "deploy":function(contractInterface){
                        iface = contractInterface
                    },
                    "save":function(state){
                        stateStorage = state
                    },
                    "commit":function(result){
                        signals.emit('commited', result)
                    }
                }
            }
        }
    }


}


class ContractVM{
    constructor(options){
        this.code = options.code
        this.compiled = ''
        this.type = (options.type == 'VM' ? 'VM' : 'NodeVM')
        this.sandbox = {}
    }

    buildVM(opts){
        if(this.type == 'VM'){
            this.vm = new VM(opts)
        }else{
            this.sandbox = new Sandbox()
            this.vm = new NodeVM(this.sandbox.context)
        }
    }

    compileScript(){
        this.compiled = new VMScript(this.code)
    }

    run(){
        return new Promise((resolve)=>{
            try{
                this.vm.run(this.compiled)
                signals.on('commited', (action)=>{
                    resolve({
                        result:{
                            state:stateStorage,
                            interface:iface,
                            action:action
                        }
                    })
                })
                
            }catch(e){

            }
        })
    }


}

module.exports = ContractVM

let myVm = new ContractVM({
    code:code,
    type:'NodeVM'
})
myVm.buildVM()

myVm.compileScript()
myVm.run()
.then((result)=>{
    console.log(result)
})



