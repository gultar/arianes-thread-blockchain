const { Worker } = require('worker_threads')
const EventEmitter = require('events')


class Mempool{
    constructor(){
        
        let launchScript = `
        const Mempool = require(__dirname+'/modules/classes/mempool/pool');
        const { parentPort } = require('worker_threads');

        process.NETWORK = '${global.NETWORK}'

        function getMethods(o){
            return Object.getOwnPropertyNames(Object.getPrototypeOf(o))
                .filter(m => 'function' === typeof o[m] && m !== 'constructor')
        }
        let path = process.cwd() + '/data/${global.NETWORK}'
        let mempool = new Mempool(path)
        mempool.events.on('newTransaction', (transaction)=>{
            parentPort.postMessage({ event:'newTransaction', data:transaction })
        })
        mempool.events.on('newAction', (action)=>{
            parentPort.postMessage({ event:'newAction', data:action })
        })
        
        parentPort.on('message', async (message)=>{
            if(message.getMethods){
                parentPort.postMessage({ methods:getMethods(mempool) }) //getMethods(mempool)
            }else if(message.method){
                let method = message.method;
                let params = message.params;
                
                parentPort.postMessage({ [method]: await mempool[method](params), method:method })
            }
        })
        `
        this.events = new EventEmitter()
        this.events.setMaxListeners(500)
        this.worker = new Worker(launchScript, { eval:true })
        this.worker.on('message', (message)=>{
            if(message.event) this.events.emit(message.event, message.data)
            else if(message.methods){
                for(let method of message.methods){
                    this.registerMethod(method)
                }
            }else if(message.method){
                let method = message.method
                this.events.emit(message.method, message[method])
            }else{
                this.events.emit(message.event, message.data)
            }
        })
        
    }

    init(){
        return new Promise((resolve)=>{
            this.worker.postMessage({ getMethods:true })
            this.worker.once('message', (message)=>{
                if(message.methods) resolve({ started:true })
            })
        })
    }

    registerMethod(method){
        this[method] = (params, ...moreParams)=>{ 
            return new Promise((resolve)=>{

                this.worker.postMessage({ method:method, params:params, moreParams:moreParams })
                this.events.once(method, (result)=>{ resolve(result) })
            })
        }
    }
}

module.exports = Mempool

