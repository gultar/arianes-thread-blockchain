

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
                        signals.on('deployed', m => console.log('EIL', m))
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
        this.codes = {}
        this.headers = {}
        this.contractClasses = {}
        this.compiled = ''
        this.sandbox = new Sandbox()
        this.vm = new NodeVM(this.sandbox.context)
    }

    compileScript(){
        this.compiled = new VMScript(this.code)
    }

    transferState(nextState){
        if(nextState){
            this.sandbox.stateStorage = nextState
            return { added:true }
        }
        return false
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

    buildFunctionWrapper(code){

        let functionWrapper = 
        `
          let failure = false
          let fail = require('fail')
  
          async function execute(){
            let instance = {};
            
            try{
              const commit = require('commit')
              const save = require('save')
              
              ${code}
              
              save(instance.state)
              commit(result)
              
            }catch(err){
              failure = err
            }
              
            
          }
  
          execute()
          .then((result)=>{
            
            if(failure){
                throw new Error(failure.message)
                fail(failure)
            }
            
          })
          .catch((e)=>{
            fail(e)
          })
          
        `
        return functionWrapper
      }

      buildContractFunctionWrapper(contractName, initParams){
        let functionWrapper = `
        async function deployment(){
            try{

                const deploy = require('deploy')
                const save = require('save')
                let paramsString = '${initParams}'
                
                let initParams = JSON.parse(paramsString)
                let instance = new ${contractName}(initParams)
                let API = await instance.getInterface()
                save({ state: instance.state })
                deploy(API)

            }catch(e){
                console.log(e)
            }
            
        }
        deployment()
        `
        
        return functionWrapper
      }

      
    setContractClass(contractName, classCode){
        if(contractName && classCode){
            this.contractClasses[contractName] = classCode
            return { added:true }
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

    runCode(state, hash){
        return new Promise(async (resolve)=>{
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
                let code = this.buildFunctionWrapper(instruction + stateHeaderInstruction + methodToRun)
                // console.log(contractCode + code)
                this.vm.run(contractCode + code)
                
                signals.once('saved', (savedState)=>{
                    this.sandbox.stateStorage = savedState
                })
                
                signals.once('commited', (action)=>{
                    resolve({
                        value:action,
                        state:this.sandbox.stateStorage
                    })
                })
                signals.once('failed', (failure)=>{
                    resolve({
                        error:failure,
                    })
                })
                
            }catch(e){
                resolve({error:e})
            }
        })
    }

    singleRun(code){
        return new Promise((resolve)=>{
            try{
                
                this.vm.run(code)
                
                signals.once('saved', (savedState)=>{
                    this.sandbox.stateStorage = savedState
                })
                
                signals.once('deployed', (API)=>{
                    resolve({
                        contractAPI:API,
                        state:this.sandbox.stateStorage
                    })
                })
                signals.once('failed', (failure)=>{
                    resolve({
                        error:failure,
                    })
                })
                
            }catch(e){
                resolve({error:e})
            }
        })
    }

    turnOffListeners(){
        signals.off('deployed')
        signals.off('saved')
        signals.off('commited')
        signals.off('failed')
    }


}

module.exports = ContractVM



