

const { VM, VMScript, NodeVM } = require('vm2');
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
                        signals.emit('deployed', contractInterface)
                    },
                    "save":function(state){
                        signals.emit('saved', state)
                    },
                    "commit":function(result){
                        signals.emit('commited', result)
                    },
                    "fail":function(failure){
                        signals.emit('failed', failure)
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
                signals.on('saved', (savedState)=>{
                    this.sandbox.stateStorage = savedState
                })
                signals.on('deployed', (contractAPI)=>{
                    resolve({
                        contractAPI:contractAPI,
                        state:this.sandbox.stateStorage
                    })
                })
                signals.on('commited', (action)=>{
                    resolve({
                        value:action,
                        state:this.sandbox.stateStorage
                    })
                })
                signals.on('failed', (failure)=>{
                    resolve({
                        error:failure,
                    })
                })
                
            }catch(e){
                resolve({error:e})
            }
        })
    }


}

module.exports = ContractVM



