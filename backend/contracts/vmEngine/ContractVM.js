

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
const { isValidActionJSON, isValidAccountJSON } = require('../../tools/jsonvalidator')

//Kind of useless
class Signals extends EventEmitter{
    constructor(){
        super()
    }
}
//Serves to communicate back and forth between VM
let signals = new Signals()
signals.setMaxListeners(50)

class ContractVM{
    constructor(options){
        this.signals = signals
        this.codes = {}
        this.headers = {}
        this.contractClasses = {}
        this.compiled = ''
        this.timers = {}
        this.contractCallThreads = {}
        this.contractCallDepthLimit = 10
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
                        "isValidActionJSON":isValidActionJSON,
                        "isValidAccountJSON":isValidAccountJSON, 
                        "getAccount":({ name, hash })=>{
                            return new Promise((resolve)=>{
                                let contractName = this.contractCallThreads[hash].contractName
                                this.signals.once('account', (account)=>{
                                    console.log('Received account', account)
                                    if(account && Object.keys(account).length > 0){
                                        resolve(account) 
                                    }else{
                                        resolve(false)
                                    }
                                })
                                this.signals.emit('getAccount', { name:name, contractName:contractName })
                            })
                        },
                        "getContract":({ contractName, hash })=>{
                            //Possibility of infinite loop
                            //Maybe just send action to contract and execute in another context
                            return new Promise(async (resolve)=>{
                                if(!contractName) resolve({error:'ERROR: Contract name is undefined'})
                                if(!hash) resolve({error:'ERROR: Call hash is undefined'})

                                let thread = this.contractCallThreads[hash]
                                if(thread){
                                    let isDepthBelowLimit = thread.depth < this.contractCallDepthLimit
                                    if(isDepthBelowLimit){
                                        this.contractCallThreads[hash].depth++
                                        if(this.contractClasses[contractName]){
                                            let contractClass = this.sandbox.context.require.mock[contractName]
                                            resolve(contractClass)
                                        }else{
                                            this.signals.once('contract', async (contract)=>{
                                                if(contract && Object.keys(contract).length > 0){
                                                    let isSet = await this.setContractClass(contractName, contract)
                                                    let exported = await this.exportContractToSandbox(contractName)
                                                    if(exported.error)  resolve(false)
                                                    let contractClass = this.sandbox.context.require.mock[contractName]
                                                    resolve(contractClass) 
                                                }else{
                                                    resolve(false)
                                                }
                                            })
                                            this.signals.emit('getContract', contractName)
                                        }
                                    }else{
                                        resolve({error:'ERROR: Call thread depth is above limit'})
                                    }
                                }else{
                                    resolve({error:'ERROR: Must have active call thread to call contract'})
                                }
                            })
                        },
                        "getState":(contractName)=>{
                            //Promise is necessary here because of the event listener call back
                            return new Promise((resolve)=>{
                                if(this.sandbox.contractStates[contractName] && Object.keys(this.sandbox.contractStates[contractName]).length > 0){
                                    resolve(this.sandbox.contractStates[contractName])
                                }else{
                                    this.signals.once('state', (state)=>{
                                    
                                        if(state && Object.keys(state).length > 0){
                                            resolve(state) 
                                        }else{
                                            this.signals.emit('failed', {error: `ERROR: Could not find state of contract ${contractName}`})
                                        }
                                    })
                                    this.signals.emit('getState', contractName)
                                }
                                
                            })
                            
                        },
                        "getCurrentBlock":()=>{
                            return new Promise((resolve)=>{
                                this.signals.emit('getCurrentBlock')
                                this.signals.once('currentBlock', block => resolve(block))
                            })
                        },
                        "deferExecution":(contractAction)=>{
                            return new Promise((resolve)=>{
                                if(contractAction){ //&& isValidContractActionJSON(contractAction)
                                    this.signals.emit('defer', contractAction)
                                    this.signals.once('deferred', (isDeferred)=>{
                                        resolve(isDeferred)
                                    })
                                }else{
                                    resolve({ error:'ERROR: Contract action received is invalid' })
                                }
                            })
                        },
                        "deploy":function(contractInterface){
                            signals.emit('deployed', contractInterface)
                        },
                        //Deprecated
                        "save":(state)=>{
                            if(state){
                                this.sandbox.stateStorage = state
                            }
                            signals.emit('saved', state)
                            
                        },
                        // Deprecated
                        "commit":function(result){
                            signals.emit('commited', result)
                        },
                        "fail":(failure)=>{
                            
                            if(this.timers[failure.hash]){
                                clearTimeout(this.timers[failure.hash])
                                signals.emit('failed', failure)
                            }else{
                                signals.emit('failed', failure)
                            }
                            
                        }
                    }
                }
            }
        }
        this.vm = new NodeVM(this.sandbox.context)
    }

    async exportContractToSandbox(contractName){
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
    

    wrapCode(code, hash){
        
        let functionWrapper = 
        `
            const fail = require('fail')
            const getState = require('getState')
            const callHash = '${hash}'
            
            async function execute(callback){
                let instance = {};
                
                try{
                    ${code}
                    callback(result, instance.state)
                }catch(err){
                    
                    let error = { error:err.message, hash:callHash }
                    fail(error)
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
                    return setTimeout(()=>{
                        console.log('TIMED OUT', call.hash)
                        this.sandbox.contractStates[call.contractName] = this.sandbox.contractStates[call.contractName]
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

                let code = this.wrapCode( codeToWrap, call.hash )
                this.timers[call.hash] = createTimer(call.cpuTime, resolve)
                this.contractCallThreads[call.hash] = {
                    contractName:contractName,
                    method:methodToRun,
                    depth:0
                }
                
                let execute = this.vm.run(importHeader + code)
                
                execute(async (result, state)=>{
                    
                    if(result){
                        if(state && Object.keys(state).length > 0){
                            this.sandbox.contractStates[call.contractName] = state
                        }

                        clearTimeout(this.timers[call.hash])
                        delete this.contractCallThreads[call.hash]
                        if(result.error){
                            resolve({
                                error:result.error,
                                hash:call.hash,
                                contractName:call.contractName
                            })
                        }else{
                            
                            resolve({
                                value:result,
                                hash:call.hash,
                                state:state, //this.sandbox.contractStates[call.contractName]
                                contractName:contractName
                            })
                        }
                    }else{
                        
                        resolve({
                            error:'ERROR: Call did not return anything',
                            hash:call.hash,
                            contractName:call.contractName
                        })
                    }

                    
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

    
    runRawCode(code){
        try{
            let execute = this.vm.run(code)
            return execute
        }catch(e){
            return {error:e.message}
        }
    }


}

module.exports = ContractVM



