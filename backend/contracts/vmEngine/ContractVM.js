

const { VM, VMScript, NodeVM } = require('vm2');
let _ = require('private-parts').createKey();
const Permissions = require('../build/permissions');
const Account = require('../../classes/account');
const Wallet = require('../../classes/wallet');
// const Transaction = require('../classes/transaction')
const Action = require('../../classes/action')
const ContractAction = require('../../classes/contractAction')
const createContractInterface = require('../toolbox/contractInterface')
const makeExternal = require('../toolbox/makeExternal')
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

class ContractVM{
    constructor(options){
        this.signals = signals
        this.codes = {}
        this.headers = {}
        this.contractClasses = {}
        this.compiled = ''
        this.sandbox = {
            stateStorage:{},
            contractStates:{},
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
                        "getState":(contractName)=>{
                            return new Promise((resolve)=>{
                                signals.once('state', (state)=>{
                                    
                                    if(state){
                                        resolve(this.sandbox.contractStates[contractName]) 
                                    }else{
                                        signals.emit('failed', {error: `ERROR: Could not find state of contract ${contractName}`})
                                    }
                                })
                                signals.emit('getState', contractName)
                            })
                            
                        },
                        "deploy":function(contractInterface){
                            signals.emit('deployed', contractInterface)
                        },
                        "save":(state)=>{
                            if(state){
                                this.sandbox.stateStorage = state
                            }
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

    async exportContractToSandbox(contractName){
        //DANGEROUS
        if(this.contractClasses[contractName]){
            let contractCode = this.contractClasses[contractName]
            let exportString = `module.exports = ${contractName}`
            let contract = await this.runRawCode(contractCode + exportString)
            this.sandbox.context.require.mock[contractName] = contract
            return contract
        }else{

        }
    }

    //to be removed
    transferState(nextState, contractName){
        if(nextState){
            this.sandbox.contractStates[contractName] = nextState
        }
    }

    setState(nextState, contractName){
        if(nextState && Object.keys(nextState).length > 0 && contractName){
            this.sandbox.contractStates[contractName] = nextState
            return true
        }else{
            if(!nextState) return { error:`Could not set state of ${contractName} because state is undefined` }
            else if(Object.keys(nextState).length == 0) return { error:`Could not set state of ${contractName} because state is an empty object` }
            else if(!contractName) return { error:`Could not set state because contract name is undefined. State: ${nextState}` }
        }
    }

    //to be removed
    setInitialState(state){
        if(state){
            this.sandbox.stateStorage = state
        }else{
            return { setInitialStateError:'Must pass valid initial state' }
        }
    }

    //to be removed
    convertToVMCode(label, code){
       return `
       let ${label}String = '${JSON.stringify(code)}'
       let ${label} = JSON.parse(${label}String)
       `
       
    }
    

    wrapCode(code){

        let functionWrapper = 
        `
            const save = require('save')
            const fail = require('fail')
            const getState = require('getState')
            
            async function execute(callback){
                let instance = {};
                
                try{
                    ${code}
                    //save(instance.state)
                    result.state = instance.state
                    callback(result)
                }catch(err){
                    fail(err.message)
                }
            }

            module.exports = execute
            
        `
        return functionWrapper
    }

    //to be removed or implemented
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

      
    async setContractClass(contractName, classCode){
        if(contractName && classCode){
            this.contractClasses[contractName] = classCode
            let exported = await this.exportContractToSandbox(contractName)
            // this.sandbox.context.require[contractName] = classCode
            return true
        }else{
            return { setContractClassError:'Must pass valid contractName and classCode' }
        }
    }

    // deployContract(contractName, initParams){
    //     return new Promise(async (resolve)=>{
    //         let contractCode = this.contractClasses[contractName]

    //         let deploymentFunction = this.buildContractFunctionWrapper(contractName, initParams)
            
    //         this.vm.run(contractCode + deploymentFunction)

    //         signals.once('commited', (contractAPI)=>{
    //             resolve({
    //                 value:contractAPI,
    //                 state:this.sandbox.stateStorage
    //             })
    //         })
            
    //         signals.once('saved', (savedState)=>{
    //             this.sandbox.stateStorage = savedState
    //         })

    //         signals.once('deployed', (contractAPI)=>{
    //             resolve({
    //                 contractAPI:contractAPI,
    //                 state:this.sandbox.stateStorage
    //             })
    //         })
    //         signals.once('failed', (failure)=>{
    //             resolve({
    //                 error:failure,
    //             })
    //         })
    //     })
    // }

    execute(call){
        try{
            
        
            let instruction = call.code
            let contractName = call.contractName
            let methodToRun = call.methodToRun
            let contractCode = this.contractClasses[call.contractName]
            let stateHeaderInstruction = `
            let state = await getState("${call.contractName}");
            await instance.setState(state);
            `
            let importHeader = `
            const ${contractName} = require('${contractName}')
            `
            
            let codeToWrap = `
            ${instruction}
            ${stateHeaderInstruction}
            ${methodToRun}
            `

            let code = this.wrapCode( codeToWrap )
            
            let execute = this.vm.run(importHeader + code)
            
            execute(async (result)=>{
                this.sandbox.contractStates[call.contractName] = this.sandbox.stateStorage
                
                this.signals.emit('saveState', {
                    state:this.sandbox.contractStates[call.contractName],
                    contractName:call.contractName
                })

                this.signals.emit('commited', {
                    value:result,
                    state:this.sandbox.stateStorage,
                    hash:call.hash,
                    contractName:call.contractName
                })
                
                
            })
            

        }catch(e){
            
            this.signals.emit('failed', {
                error:e.message,
                hash:call.hash,
                contractName:call.contractName
            })
        }

        
    }

    runManyCalls(calls){
        return new Promise(async (resolve)=>{
            let results = {}
            let errors = {}
            for await(let hash of Object.keys(calls)){
                let call = calls[hash]

                let result = await this.run(call)
                
                if(result.error) errors[hash] = result
                else results[hash] = result
            }
            
            resolve( { results:{ ...results }, errors:{ ...errors } })
        })
    }

    run(call){
        return new Promise((resolve)=>{
            try{
                let timer
                const createTimer = (time, resolve) =>{
                    timer = setTimeout(()=>{
                        resolve({
                            error:"ERROR: VM timed out",
                            hash:call.hash,
                            contractName:call.contractName
                        })
                    }, time)
                }
        
                let instruction = call.code
                let contractName = call.contractName
                let methodToRun = call.methodToRun
                let contractCode = this.contractClasses[call.contractName]
                let state = this.sandbox.contractStates[call.contractName]
                let setState = `
                let stateString = '${JSON.stringify(state)}';
                let state = JSON.parse(stateString);
                await instance.setState(state);
                `
                let stateHeaderInstruction = `
                let state = await getState("${call.contractName}");
                await instance.setState(state);
                `

                let importHeader = `
                const ${contractName} = require('${contractName}')
                `
                
                let codeToWrap = `
                ${instruction}
                ${stateHeaderInstruction}
                ${methodToRun}

                `
    
                let code = this.wrapCode( codeToWrap )
                createTimer(call.cpuTime, resolve)
                let execute = this.vm.run(importHeader + code)
                
                execute(async (result)=>{
                    clearTimeout(timer)
                    if(result.state && Object.keys(result.state).length > 0){
                        this.sandbox.contractStates[call.contractName] = result.state
                    }else{
                        resolve({
                            error:`State received from result ${call.hash} is empty`,
                            hash:call.hash,
                            contractName:call.contractName
                        })
                    }
                    
                    resolve({
                        value:result.success,
                        hash:call.hash,
                        state:result.state, //this.sandbox.contractStates[call.contractName]
                        contractName:contractName
                    })
                    
                    
                })
                
    
            }catch(e){
                
                resolve({
                    error:e.message,
                    hash:call.hash,
                    contractName:call.contractName
                })
                
            }
        })

        
    }

    // run(hash){
    //     try{
            
        
    //         let instruction = this.codes[hash].code
    //         let contractName = this.codes[hash].contractName
    //         let methodToRun = this.codes[hash].methodToRun
    //         let contractCode = this.contractClasses[contractName]
    //         let stateHeaderInstruction = `
    //         let state = await loadState("${contractName}");
    //         await instance.setState(state);`
            
    //         let codeToWrap = `
    //         ${instruction}
    //         ${stateHeaderInstruction}
    //         ${methodToRun}
    //         `
    //         let code = this.wrapCode( codeToWrap )
    //         let execute = this.vm.run(contractCode + code)
            
    //         execute(async (result)=>{
    //             this.signals.emit('commited', {
    //                 value:result,
    //                 state:this.sandbox.stateStorage,
    //                 hash:hash,
    //                 contractName:contractName
    //             })
                
    //         })
            

    //     }catch(e){
            
    //         this.signals.emit('failed', {
    //             error:e.message,
    //             hash:hash,
    //             contractName:contractName
    //         })
    //     }

        
    // }

    
    runRawCode(code){
        try{
            let execute = this.vm.run(code)
            return execute
        }catch(e){
            return {error:e}
        }
    }


}

module.exports = ContractVM



