const http = require('http')
const express = require('express')
const socketIo = require('socket.io')
const ChainAPIClient = require('../chainAPIClient')
const { Worker } = require('worker_threads')
const vmBootstrap = require('../../classes/contracts/vmEngine/bootstrap')
const Factory = require('../../classes/contracts/build/callFactory')
const ContractConnector = require('../../classes/contracts/contractConnector')
const { isValidTransactionCallJSON } = require('../../tools/jsonvalidator')

const CONTRACT_PORT = 8700
const CHAIN_PORT = 8500

class ContractAPI{
    constructor(){
        this.app = express()
        this.httpServer = http.createServer(this.app)
        this.server = {}
        this.chainClient = {}
        this.contractConnector = {}
        this.apiWorker = {}
        this.bootstrap = {}
        this.channel = {}
        this.factory = {}
    }

    init(){
        // this.apiWorker = new Worker(`
        // console.log(__dirname)
        // const ChainAPI = require(__dirname+'/modules/api/chainAPI')
        
        // let api = new ChainAPI(${CHAIN_PORT})
        // api.init()
        // `, { eval:true })
        const ChainAPI = require('../chainAPI')
        
        let api = new ChainAPI(CHAIN_PORT)
        api.init()
        .then(()=>{
            this.httpServer.listen(CONTRACT_PORT, 'localhost')
            this.server = socketIo(this.httpServer)
            this.server.on('connection', async (socket)=>{
                await this.connectChainClient()
                this.routes(socket)
            })
        })
    }

    async connectChainClient(){
        this.chainClient = new ChainAPIClient()
        let connected = await this.chainClient.connect('http://localhost:'+CHAIN_PORT)
        await this.initBootstrap()
        
        return { okay:true }
    }

    async initBootstrap(){
        this.contractConnector = new ContractConnector({
            contractTable:this.chainClient.contractTable,
        })
        this.factory = new Factory({
            contractTable:this.chainClient.contractTable,
            accountTable:this.chainClient.accountTable
        })
        this.bootstrap = new vmBootstrap({
            contractConnector:this.contractConnector,
            accountTable:this.chainClient.accountTable,
            buildCode:()=>{},
            deferContractAction:()=>{},
            getCurrentBlock:()=>{
                let length = this.chainClient.chain.length
                return this.chainClient.chain[length - 1]
            },
            emitContractAction: this.emitContractAction,
            emitPayable:this.emitPayable,
            deferPayable:this.deferPayable,
            getBalance:async (accountName)=>{
                if(!accountName) return { error:'ERROR: Undefined account name' }
                let account = await this.chainClient.accountTable.getAccount(accountName)
                if(account.error) return { error:account.error }
        
                let balance = this.chainClient.balance.getBalance(account.ownerKey)
                if(balance.error) return { error:balance.error }
                else return balance
              }
        });
        this.channel = this.bootstrap.startVM()

        return { started:true }
    }

    routes(socket){
        socket.on('transaction', async (transaction)=>{
            await this.runTransaction(transaction)
        })
    }

    convertTransactionCallToAction(transaction){
        return {
          fromAccount: transaction.fromAddress,
          data:{
            contractName: transaction.toAddress,
            method: transaction.data.method,
            params: transaction.data.params,
            memory: transaction.data.memory,
            cpuTime: transaction.data.cpuTime
          },
          hash:transaction.hash,
          transaction:transaction
        }
    }

    async setupBootstrap(contractName){
        let contractCode = await this.contractConnector.getContractCode(contractName)
        if(contractCode){
            let added = await this.bootstrap.addContract(contractName, contractCode)
            if(added.error) return { error:added.error } 

            let state = await this.contractConnector.getState(contractName)
            if(state && Object.keys(state).length > 0){
                
                let stateAdded = await this.bootstrap.setContractState(contractName, state)
                if(stateAdded.error) return { error:stateAdded.error }

                return { setup:true }
            }else{
                return { error:`ERROR: Could not find state of ${contractName} while executing multiple calls` }
            }
            
            
        }
    }

    runTransaction(transaction){
        return new Promise(async (resolve)=>{
            let call = this.convertTransactionCallToAction(transaction)
            let code = await this.factory.createSingleCode(call)
            
            let setup = await this.setupBootstrap(code.contractName)
            if(setup.error) resolve({error:setup.error})
            else{
                this.channel.emit('run', code)
                this.channel.on(call.hash, (result)=>{
                    console.log(result)
                    resolve(result)
                })
            }
            
        })
    }
}

let api = new ContractAPI()
api.init()

let client = require('socket.io-client')
let Transaction = require('../../classes/transactions/transaction')
let socket = client('http://localhost:'+CONTRACT_PORT)
let transaction = new Transaction
({
    fromAddress:"tuor",
    toAddress:"Storage",
    amount:0,
    data:{
        method:'set',
        cpuTime:5,
        params:{
            id:"muppet",
            data:{
                'kermit':'the_frog'
            }
        }
    },
    type:"call"
});
socket.on('connect',()=>{
    setTimeout(()=>{
        socket.emit('transaction', transaction)
    }, 5000)
})