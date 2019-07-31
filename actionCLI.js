#!/usr/bin/env node

const program = require('commander');
const ioClient = require('socket.io-client');
const axios = require('axios');
const AccountCreator = require('./backend/classes/accountCreator');
const WalletManager = require('./backend/classes/walletManager');
const AccountTable = require('./backend/classes/accountTable');
const Action = require('./backend/classes/action');
const ContractVM = require('./backend/contracts/VM.js')
const sha1 = require('sha1');
const fs = require('fs')

let connected = false
const openSocket = async (address, runFunction) =>{
    let socket = ioClient(address, {'timeout':1000, 'connect_timeout': 1000});
    setTimeout(()=>{
        socket.close()
    },1000)
    if(socket){
        runFunction(socket);
    }else{
        console.log('Could not connect to node')
    }
}

program
.option('-u, --url <url>', 'URL of blockchain node')
.option('-c, --contractName <contractName>', 'Specify the name of the contract to be called')
.option('-f, --filename <filename>', 'Filename of contract. Relative path : "./contract.js" ')
.option('-t, --task <task>', 'Define the task to be executed on the action')
.option('-d, --data <data>', 'Data to accompany the task. Always pass a JSON string, ex: {"key":"value"} ')
.option('-i, --initParams <initParams>', 'Define initial parameters of smart contract" ')
.option('-a, --accountName <accountName>', "Name of the account's owner wallet")
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')


program
.command('createaccount <accountName> <walletName> <password>')
.description('Requests some general information about the blockchain')
.action(async (accountName, walletName, password)=>{
    if(!program.url){
        throw new Error('URL of blockchain node is required');
            
    }else{
        let address = program.url;
        
        let accountCreator = new AccountCreator();
        
        let walletManager = new WalletManager();
        
        let newAccount = await accountCreator.createAccount(accountName, walletName, password);
        
        let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);

        let action = new Action({ 
            name:newAccount.name, 
            publicKey:newAccount.ownerKey 
        }, 'account', 'create', newAccount);
        
        walletManager.unlockWallet(walletName, password)
        .then(async (unlocked)=>{
            
            if(unlocked){
                let signature = await wallet.sign(action.hash)
                if(signature){
                    action.signature = signature;
                    axios.post(`${address}/action`, action)
                    .then( response => {
                        console.log(response.data);
                    })
                    .catch(e => console.log(e))
                    // socket.close()
                }else{
                    console.log('ERROR: Could not sign action')
                }
                

            }else{
                console.log('ERROR: Could not unlock wallet')
            }
        })
    }
    // openSocket(address, async (socket)=>{

        
    // })
})

program
.command('call')
.option('-c, --contractName <contractName>', 'Specify the name of the contract to be called')
.option('-t, --task <task>', 'Define the task to be executed on the action')
.option('-d, --data <data>', 'Data to accompany the task. Always pass a JSON string, ex: {"key":"value"} ')
.option('-a, --accountName <accountName>', "Name of the account's owner wallet")
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')
.description('Requests some general information about the blockchain')
.action(()=>{
            let address = program.url;
            let contractName = program.contractName
            let accountName = program.accountName
            let walletName = program.walletName
            let password = program.password
            let task = program.task
            let data = program.data
            

            if(!address) throw new Error('ERROR: URL of receiving node is required')
            if(!accountName) throw new Error('ERROR: Name of sending account is required')
            if(!contractName) throw new Error('ERROR: Name of contract to call is required')
            if(!walletName) throw new Error('ERROR: Name of owner wallet is required')
            if(!password) throw new Error('ERROR: Password of owner wallet is required')
            if(!task) throw new Error('ERROR: Task to execute on action is required')

            openSocket(address, async (socket)=>{

                let accountTable = new AccountTable();
                
                let loaded = await accountTable.loadAllAccountsFromFile();
                
                let account = await accountTable.getAccount(accountName)
                
                let walletManager = new WalletManager();
                let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);
                
                data = JSON.parse(data)

                let action = new Action({ 
                    name:account.name, 
                    publicKey:account.ownerKey 
                },
                "contract","call",
                {  
                    contractName:contractName,
                    method:task,
                    params:data,
                    account:account,
                });
                
                walletManager.unlockWallet(walletName, password)
                .then(async (unlocked)=>{
                    
                    if(unlocked){
                        let signature = await wallet.sign(action.hash)
                        if(signature){
                            action.signature = signature;
                            
                            axios.post(`${address}/action`, action)
                            .then( response => {
                                console.log(response.data);
                            })
                            .catch(e => console.log(e))
                            socket.close()
                        }else{
                            console.log('ERROR: Could not sign action')
                        }
                        

                    }else{
                        console.log('ERROR: Could not unlock wallet')
                    }
                })
            
        })

    
})

program
.command('deployContract')
.description('Requests some general information about the blockchain')
.action(()=>{
            let address = program.url;
            // console.log(address)
            let contractName = program.contractName
            // console.log('Contract', contractName)
            let accountName = program.accountName
            // console.log('Account:', accountName)
            let walletName = program.walletName
            // console.log('Wallet:', walletName)
            let password = program.password
            // console.log('Pass:', password)
            let filename = program.filename
            // console.log('File:', filename)
            let initParams = program.initParams
            // console.log('init:', initParams)
            
            if(!address) throw new Error('ERROR: URL of receiving node is required')
            if(!accountName) throw new Error('ERROR: Name of sending account is required')
            if(!contractName) throw new Error('ERROR: Name of contract to call is required')
            if(!filename) throw new Error('ERROR: Name of contract file is required')
            if(!walletName) throw new Error('ERROR: Name of owner wallet is required')
            if(!password) throw new Error('ERROR: Password of owner wallet is required')
            // if(!initParams) throw new Error('ERROR: Initial parameters of contract are required')

            openSocket(address, async (socket)=>{
                let contract = fs.readFileSync(filename).toString()
                if(contract){

                    let accountTable = new AccountTable();
                
                    let loaded = await accountTable.loadAllAccountsFromFile();
                    let account = await accountTable.getAccount(accountName)
                    if(!initParams) initParams = {}
                    initParams.contractAccount = account;
                    initParams = JSON.stringify(initParams)

                    let walletManager = new WalletManager();
                    let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);

                    let deploymentInstruction = `
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

                    let deployContract = contract + deploymentInstruction
                    
                    let vm = new ContractVM({
                        code:deployContract,
                        type:'NodeVM'
                      })
    
                      vm.buildVM()
                      vm.compileScript()
                      let result = await vm.run()
                      if(result){
                        // if(!isValidContractDeploy(result)) throw new Error('ERROR: Deployment failed, ContractAPI, contract name and initial state required')
                        
                        let action = new Action({ 
                            name:account.name, 
                            publicKey:account.ownerKey 
                        },
                        "contract","deploy",
                        {
                            name:contractName,
                            code:contract,
                            contractAPI:result.contractAPI,
                            initParams:initParams,
                            account:account,
                            state:result.state
                        });
                        
                        walletManager.unlockWallet(walletName, password)
                        .then(async (unlocked)=>{
                            
                            if(unlocked){
                                let signature = await wallet.sign(action.hash)
                                if(signature){
                                    action.signature = signature;
                                    
                                    axios.post(`${address}/action`, action)
                                    .then( response => {
                                        console.log(response.data);
                                    })
                                    .catch(e => console.log(e))
                                    socket.close()
                                }else{
                                    console.log('ERROR: Could not sign action')
                                }
                                
        
                            }else{
                                console.log('ERROR: Could not unlock wallet')
                            }
                        })
                      }
                }else{
                    throw new Error('ERROR: Could not find target contract file')
                }
        })

    
})

program
.command('getaccounts <address> [ownerKey]')
.description('Gets all existing accounts on node')
.action(async (address, ownerKey)=>{
    openSocket(address, async (socket)=>{
        if(!ownerKey){
            socket.emit('getAccounts');
        }else{
            socket.emit('getAccounts', ownerKey) 
        }
            
        socket.on('accounts', accounts => console.log(JSON.stringify(accounts, null, 2)))
        
    })
})

program.parse(process.argv)