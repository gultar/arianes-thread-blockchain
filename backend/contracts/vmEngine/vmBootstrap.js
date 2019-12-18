const EventEmitter = require('events')



class VMBootstrap{
    constructor({ contractConnector }){
        this.contractConnector = contractConnector
        this.child = null;
        this.events = new EventEmitter()
        this.ping = null;
        this.pingLimit = 5
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
                
                // this.events.emit('results', message.results)

                let results = message.results
                let errors = message.errors
                
                if(Object.keys(results).length == 0 && Object.keys(errors).length > 0){
                    for await(let hash of Object.keys(errors)){
                        let result = errors[hash]
                        this.events.emit(hash, {
                            error:result.error,
                            contractName:result.contractName,
                            hash:hash
                        })
                    }
                }else if(Object.keys(results).length > 0 && Object.keys(errors).length > 0){
                    let total = {  ...results, ...errors }
                    for await(let hash of Object.keys(total)){
                        let result = total[hash]
    
                        if(result.error){
                            this.events.emit(hash, {
                                error:result.error,
                                contractName:result.contractName,
                                hash:hash
                            })
                        }else{
                            this.events.emit(hash, {
                                executed:result,
                                contractName:result.contractName,
                                state:result.state,
                                hash:hash
                            })
                        }
                    }
                }else if(Object.keys(results).length > 0 && Object.keys(errors).length == 0){
                    for await(let hash of Object.keys(results)){
                        let result = results[hash]
                        this.events.emit(hash, {
                            executed:result,
                            contractName:result.contractName,
                            state:result.state,
                            hash:hash
                        })
                    }
                }



                this.events.emit('finished', true)

                
            }else if(message.getState){
                
                let state = await this.contractConnector.getState(message.getState);
                if(state){
                    if(state.error) this.child.send({ state:null })
                    else{
                        this.child.send({ state:state })
                    }
                }else{
                    this.child.send({ state:null })
                }
            }else if(message.error){
                console.log('VM ERROR:',message)
                if(message.hash){
                    this.events.emit(message.hash, {
                        error:message.error,
                        contractName:message.contractName
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