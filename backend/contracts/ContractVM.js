

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
signals.setMaxListeners(50)

// class Sandbox{
//     constructor(){
//         this.iface = {}
//         this.stateStorage  = {}
//         this.context = {
//             wrapper:'none',
//             require:{
//                 external: true, 
//                 builtin: [], 
//                 root: "./", 
//                 mock: {
//                     "Wallet":Wallet,
//                     "Account":Account,
//                     "Action":Action,
//                     "ContractAction":ContractAction,
//                     "Permissions":Permissions,
//                     "createContractInterface":createContractInterface,
//                     "makeExternal":makeExternal,
//                     "getFunctionArguments":getFunctionArguments,

//                     "deploy":function(contractInterface){
//                         signals.emit('deployed', contractInterface)
//                     },
//                     "save":function(state){
//                         signals.emit('saved', state)
//                         process.send({saved:state})
//                         process.send({message:'received'})
//                     },
//                     "commit":function(result){
//                         signals.emit('commited', result)
//                     },
//                     "fail":function(failure){
//                         signals.emit('failed', failure)
//                     }
//                 }
//             }
//         }
//     }


// }


class ContractVM{
    constructor(options){
        this.signals = signals
        this.codes = {}
        this.headers = {}
        this.contractClasses = {}
        this.compiled = ''
        this.sandbox = {
            stateStorage:{},
            context:{
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
        this.vm = new NodeVM(this.sandbox.context)
    }

    transferState(nextState){
        if(nextState){
            this.sandbox.stateStorage = nextState
        }
    }

    setInitialState(state){
        if(state){
            this.sandbox.stateStorage = state
        }else{
            return { setInitialStateError:'Must pass valid initial state' }
        }
    }

    convertToVMCode(label, code){
       return `
       let ${label}String = '${JSON.stringify(code)}'
       let ${label} = JSON.parse(${label}String)
       `
       
    }

    buildExportWrapper(code){

        let functionWrapper = 
        `
            const saved = require('save')
            const fail = require('fail')
            
            async function execute(callback){
                let instance = {};
                try{
                    ${code}
                    save(instance.state)
                    callback(result)
                }catch(err){
                    fail(err.message)
                }
            }

            module.exports = execute
            
        `
        return functionWrapper
    }

    buildExportWrapperWithRequire(code, contractName){

        let functionWrapper = 
        `
            async function execute(callback){
            let instance = {};
            try{
                let ${contractName} = require('${contractName}')
                ${code}
                callback(result)
            }catch(err){
                throw new Error(err)
            }
            }

            module.exports = execute
            
        `
        return functionWrapper
    }

    buildContractFunctionWrapper(contractName, initParams){
    let functionWrapper = `

    async function deploy(callback){
        let instance = {};
        try{
            let paramsString = '${initParams}'
            
            let initParams = JSON.parse(paramsString)
            let instance = new ${contractName}(initParams)
            let API = await instance.getInterface()
            callback(API)
        }catch(err){
            throw new Error(err)
        }
        }

        module.exports = deploy
    `
    
    return functionWrapper
    }

      
    setContractClass(contractName, classCode){
        if(contractName && classCode){
            this.contractClasses[contractName] = classCode
            this.sandbox.context.require[contractName] = classCode
        }else{
            return { setContractClassError:'Must pass valid contractName and classCode' }
        }
    }

    deployContract(contractName, initParams){
        return new Promise(async (resolve)=>{
            let contractCode = this.contractClasses[contractName]

            let deploymentFunction = this.buildContractFunctionWrapper(contractName, initParams)
            
            this.vm.run(contractCode + deploymentFunction)

            signals.once('commited', (contractAPI)=>{
                resolve({
                    value:contractAPI,
                    state:this.sandbox.stateStorage
                })
            })
            
            signals.once('saved', (savedState)=>{
                this.sandbox.stateStorage = savedState
            })

            signals.once('deployed', (contractAPI)=>{
                resolve({
                    contractAPI:contractAPI,
                    state:this.sandbox.stateStorage
                })
            })
            signals.once('failed', (failure)=>{
                resolve({
                    error:failure,
                })
            })
        })
    }

    run(hash){
        try{
            let nextState = this.sandbox.stateStorage || {}
            let stateHeaderInstruction = `
            let currentStateString = '${JSON.stringify(nextState)}'
            let currentState = JSON.parse(currentStateString)
            await instance.setState(currentState)
            `
            let instruction = this.codes[hash].code
            let contractName = this.codes[hash].contractName
            let methodToRun = this.codes[hash].methodToRun
            let contractCode = this.contractClasses[contractName]
            let code = this.buildExportWrapper(instruction + stateHeaderInstruction + methodToRun)
            
            let execute = this.vm.run(contractCode + code)
            
            execute(async (result)=>{
                
                this.signals.emit('commited', {
                    value:result,
                    state:this.sandbox.stateStorage,
                    hash:hash,
                    contractName:contractName
                })
                
            })
            

        }catch(e){
            console.log('Catching this shit', e)
            this.signals.emit('failed', {
                error:e,
                hash:hash,
                contractName:contractName
            })
        }

        
    }

    
    singleRun(code){
        try{
            let execute = this.vm.run(this.buildExportWrapper(code))
            
            execute(async (result)=>{
    
                this.signals.emit('commited', {
                    value:result,
                    state:this.sandbox.stateStorage,
                    hash:hash,
                    contractName:contractName
                })
                
            })
        }catch(e){
            return {error:e}
        }
    }


}

module.exports = ContractVM



