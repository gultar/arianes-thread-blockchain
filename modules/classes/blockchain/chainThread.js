const { Worker } = require('worker_threads')
const EventEmitter = require('events')
const ContractTable = require('../tables/contractTable')
const BalanceTable = require('../tables/balanceTable')
const AccountTable = require('../tables/accountTable')

class Blockchain{
    constructor(){
        let launchScript = `
        const Blockchain = require(__dirname+'/modules/classes/blockchain/blockchain');
        const Mempool = require(__dirname+'/modules/classes/mempool/mempool')
        const { parentPort } = require('worker_threads');

        process.NETWORK = '${process.NETWORK}'
        
        function getMethods(o){
            return Object.getOwnPropertyNames(Object.getPrototypeOf(o))
                .filter(m => 'function' === typeof o[m] && m !== 'constructor')
        }

        let mempool = new Mempool()
        let blockchain = new Blockchain([], mempool)

        mempool.events.on('newTransaction', (transaction)=>{
            parentPort.postMessage({ event:'newTransaction', data:transaction })
        })
        
        parentPort.on('message', async (message)=>{
            if(message.getMethods){
                parentPort.postMessage({ methods:getMethods(blockchain) })
            }else if(message.method){
                let method = message.method;
                let params = message.params;
                
                parentPort.postMessage({ [method]: await blockchain[method](params), method:method })
            }else if(message.getChain){
                parentPort.postMessage({ chain:blockchain.chain })
            }else if(message.getSnapshot){
                parentPort.postMessage({ snapshot:blockchain.chainSnapshot })
            }else if(message.stopController){
                parentPort.postMessage({ stopped:true })
            }else if(message.sendLatestBlock){
                parentPort.postMessage({ sendingLatestBlock:blockchain.getLatestBlock() })
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
                if(message.method == 'receiveBlock'){
                    this.worker.postMessage({ sendLatestBlock:true })
                }
                let method = message.method
                this.events.emit(message.method, message[method])
            }else if(message.chain){
                this.chain = message.chain
            }else if(message.snapshot){
                this.chainSnapshot = message.snapshot
            }else if(message.sendingLatestBlock){
                this.chain.push(message.sendingLatestBlock)
            }else{
                this.events.emit(message.event, message.data)
            }
        })
        this.accountTable = new AccountTable()
        this.balance = new BalanceTable(this.accountTable)
        this.contractTable = new ContractTable({
            getCurrentBlock:()=>{
                return this.getLatestBlock()
            },
            getBlock:(blockNumber)=>{
                return this.chain[blockNumber]
            },
        })
        
    }

    registerMethod(method){
        if(method !== 'getLatestBlock'){
            this[method] = (params, ...moreParams)=>{ 
                return new Promise((resolve)=>{
    
                    this.worker.postMessage({ method:method, params:params, moreParams:moreParams })
                    this.events.once(method, (result)=>{ resolve(result) })
                })
            }
        }
        
    }

    getMethods(){
        return new Promise((resolve)=>{
            this.worker.postMessage({ getMethods:true })
            this.worker.once('message', (message)=>{
                if(message.methods){
                    resolve({ gotMethods:true })
                }
            })
        })
    }

    init(){
        return new Promise(async (resolve)=>{
            let gotMethods = await this.getMethods()
            
            this.worker.postMessage({ method:'init', params:'' })
            this.worker.once('message', async (message) =>{
                if(message.method === 'init'){
                    let gotChain = await this.getChain()
                    let gotSnapshot = await this.getSnapshot()
                    resolve({ started:true })
                }
            })
            
        })
    }

    getChain(){
        return new Promise((resolve)=>{
            this.worker.postMessage({ getChain:true })
            this.worker.once('message', (message)=>{
                if(message.chain){
                    resolve({ gotChain:true })
                }
            })
        })
    }

    getSnapshot(){
        return new Promise((resolve)=>{
            this.worker.postMessage({ getSnapshot:true })
            this.worker.once('message', (message)=>{
                if(message.snapshot){
                    resolve({ gotSnapshot:true })
                }
            })
        })
    }

    getLatestBlock(){
        return this.chain[this.chain.length - 1]
    }

    getTotalDifficulty(){
        return this.chain[this.chain.length - 1].totalDifficulty
    }

    extractHeader(block){
        var header = {
            blockNumber:block.blockNumber,
            timestamp:block.timestamp,
            previousHash:block.previousHash,
            hash:block.hash,
            nonce:block.nonce,
            merkleRoot:block.merkleRoot,
            actionMerkleRoot:block.actionMerkleRoot,
            difficulty:block.difficulty,
            totalDifficulty:block.totalDifficulty,
            challenge:block.challenge,
            txHashes:(block.transactions? Object.keys(block.transactions) : []),
            actionHashes:(block.actions ? Object.keys(block.actions):[]),
            minedBy:block.minedBy,
            signatures:block.signatures
          }
      
          if(block.actions){
            header.actionHashes = Object.keys(block.actions)
          }
      
          return header
    }

    stopVmController(){
        return new Promise((resolve)=>{
            this.worker.postMessage({ stopController:true })
            this.worker.once('message', (message)=>{
                if(message.stopped){
                    resolve({ stopped:true })
                }
            })
        })
    }
}

module.exports = Blockchain


