const EventEmitter = require('events')



class VMBootstrap{
    constructor({ contractConnector, accountTable }){
        this.contractConnector = contractConnector
        this.accountTable = accountTable
        this.child = null;
        this.events = new EventEmitter()
        this.ping = null;
        this.pingLimit = 25
    }

    async addContract(contractName){
        let contractCode = await this.contractConnector.getContractCode(contractName)
        if(contractCode){
            this.child.send({contractName:contractName, contractCode:contractCode})
            return { sent: true }
        }else{
            return { error:'ERROR: Could not get contract code of '+contractName }
        }
    }

    async setContractState(contractName, state){
        if(contractName && state){
            this.child.send({setState:state, contractName:contractName})
            return true
        }else{
            return { error:'ERROR: Must provide valid contract name and state to setup vm statestorage'}
        }
    }

    startVM(){
        
        this.child = require('child_process').fork(`./backend/contracts/vmEngine/workerVM.js`,{
            execArgv: [`--max-old-space-size=1024`],
            //silent:true
        })
        let unansweredPings = 0
        this.ping = setInterval(()=>{
            if(unansweredPings >= this.pingLimit){
                console.log('VM is unresponsive. Restarting.')
                this.restartVM()
            }else{
                this.child.send({ping:true})
                unansweredPings++
            }
            
        }, 200)

        this.events.on('run', (code)=>{
            
            this.child.send({run:code, hash:code.hash, contractName:code.contractName})
            
        })

        this.events.on('runCode', async (codes)=>{
            
            this.child.send({runCode:codes})
            
        })

        this.child.on('message', async (message)=>{
            if(message.executed){
                
                this.events.emit(message.hash, {
                    executed:message.executed,
                    contractName:message.contractName
                })
                
                

            }else if(message.results){
                
                this.events.emit('results', message.results)
                // this.events.emit('finished', true)

                // let results = message.results
                // let errors = message.errors
                // 
                // if(Object.keys(results).length == 0 && Object.keys(errors).length > 0){
                //     for await(let hash of Object.keys(errors)){
                //         let result = errors[hash]
                //         this.events.emit(hash, {
                //             error:result.error,
                //             contractName:result.contractName,
                //             hash:hash
                //         })
                //     }
                // }else if(Object.keys(results).length > 0 && Object.keys(errors).length > 0){
                //     let total = {  ...results, ...errors }
                //     for await(let hash of Object.keys(total)){
                //         let result = total[hash]
    
                //         if(result.error){
                //             this.events.emit(hash, {
                //                 error:result.error,
                //                 contractName:result.contractName,
                //                 hash:hash
                //             })
                //         }else{
                //             this.events.emit(hash, {
                //                 executed:result,
                //                 contractName:result.contractName,
                //                 state:result.state,
                //                 hash:hash
                //             })
                //         }
                //     }
                // }else if(Object.keys(results).length > 0 && Object.keys(errors).length == 0){
                //     for await(let hash of Object.keys(results)){
                //         let result = results[hash]
                //         this.events.emit(hash, {
                //             executed:result,
                //             contractName:result.contractName,
                //             state:result.state,
                //             hash:hash
                //         })
                //     }
                // }



                

                
            }else if(message.singleResult){

                let result = message.singleResult
                this.events.emit(result.hash, {
                    value:result.value,
                    contractName:result.contractName,
                    state:result.state,
                    hash:result.hash
                })
                
            }else if(message.getState){
                console.log('VM Request state because its loaded state is empty')
                let state = await this.contractConnector.getState(message.getState);
                if(state && Object.keys(state).length > 0){
                    if(state.error) this.child.send({error:state.error})
                    else{
                        this.child.send({ state:state })
                    }
                }else{
                    this.child.send({error:'Could not find state of '+message.getState})
                }
            }else if(message.getContract){
                console.log('Requested a contract', message.getContract)
                let contract = await this.contractConnector.getContractCode(message.getContract);
                if(contract && Object.keys(contract).length > 0){
                    if(contract.error) this.child.send({error:contract.error})
                    else{
                        this.child.send({ contract:contract })
                    }
                }else{
                    this.child.send({ contract:{} })
                }
            }else if(message.getAccount){
                let account = await this.accountTable.getAccount(message.getAccount);
                if(account && Object.keys(account).length > 0){
                    if(account.error) this.child.send({error:account.error})
                    else{
                        this.child.send({ account:account })
                    }
                }else{
                    this.child.send({ account:{} })
                }
            }else if(message.error){
                console.log('VM ERROR:',message)
                if(message.error.hash){
                    if(message.error && Object.keys(message.error).length == 0){
                        message.error = 'ERROR: Unknown error'
                    }
                    this.events.emit(message.error.hash, {
                        error:message.error,
                        contractName:message.error.contractName
                    })
                }else{
                    
                    this.restartVM()
                }
            }else if(message.pong){
                unansweredPings = 0
            }else{
                console.log('Message:', message)
            }
        })

        this.child.on('error', (data)=> {
            console.log('stderr: ' + data);
        });

        this.child.on('close', async (code, signal)=> { 
            
        })

        return this.events
    }

    restartVM(){
        this.child.kill()
        clearInterval(this.ping)
        this.events.removeAllListeners()
        this.startVM()
    }

    stop(){
        this.child.kill()
        clearInterval(this.ping)
        this.events.removeAllListeners()
    }

}

module.exports = VMBootstrap