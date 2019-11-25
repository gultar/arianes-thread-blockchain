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
.option('-y, --accountType <accountType>', 'Define type of account. Either user or contract')
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')


program
.command('createaccount')
.option('-a, --accountName <accountName>', "Name of the account's owner wallet")
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')
.option('-y, --accountType <accountType>', 'Define type of account. Either user or contract')
.description(`
Creates an account to send contract call actions

Synthax : node actionCLI.js createaccount -a [account] -w [wallet] -p [passwd]
`)
.action(async ()=>{

    let address = program.url;
    let accountName = program.accountName
    let walletName = program.walletName
    let password = program.password

    let accountType = program.accountType || 'user'

    if(!address) throw new Error('ERROR: URL of receiving node is required')
    if(!accountName) throw new Error('ERROR: Name of sending account is required')
    if(!walletName) throw new Error('ERROR: Name of owner wallet is required')
    if(!password) throw new Error('ERROR: Password of owner wallet is required')


    if(!program.url){
        throw new Error('URL of blockchain node is required');
            
    }else{
        let address = program.url;
        let accountCreator = new AccountCreator();
        let walletManager = new WalletManager();
        let newAccount = await accountCreator.createAccount(accountName, accountType, walletName, password);
        let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);

        let action = new Action(accountName, 'account', 'create', newAccount);
        
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
                }else{
                    console.log('ERROR: Could not sign action')
                }
                

            }else{
                console.log('ERROR: Could not unlock wallet')
            }
        })
    }
})


program
.command('test')
.option('-c, --contractName <contractName>', 'Specify the name of the contract to be called')
.option('-t, --task <task>', 'Define the task to be executed on the action')
.option('-d, --data <data>', 'Data to accompany the task. Always pass a JSON string, ex: {"key":"value"} ')
.option('-a, --accountName <accountName>', "Name of the account's owner wallet")
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')
.description(`
Tests a call to a contract before sending it

Synthax : node actionCLI.js test -c [ContractName] -t [Task] -a [account] -w [wallet] -p [passwd] -d [Data => '{"key":"value"}']
`)
.action(()=>{
            console.log('Port: ', process.env.PORT)
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

                let walletManager = new WalletManager();
                let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);
                
                data = JSON.parse(data)

                let action = new Action(
                    accountName,
                    "contract",
                    "call",
                {  
                    contractName:contractName,
                    method:task,
                    params:data,
                    account:accountName,
                });
                
                walletManager.unlockWallet(walletName, password)
                .then(async (unlocked)=>{
                    
                    if(unlocked){
                        let signature = await wallet.sign(action.hash)
                        if(signature){
                            action.signature = signature;
                            
                            axios.post(`${address}/testAction`, action)
                            .then( response => {
                                if(response.data.result){
                                    console.log({ result:response.data.result })
                                }else{
                                    if(response.data.error){
                                        console.log('An error occurred:', response.data.error)
                                    }else{
                                        console.log(`Contract call "${task}" has been succesfully been sent`)
                                        console.log(`Call's action: `, response.data)
                                    }
                                    
                                }
                                
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
.command('call')
.option('-c, --contractName <contractName>', 'Specify the name of the contract to be called')
.option('-t, --task <task>', 'Define the task to be executed on the action')
.option('-d, --data <data>', 'Data to accompany the task. Always pass a JSON string, ex: {"key":"value"} ')
.option('-a, --accountName <accountName>', "Name of the account's owner wallet")
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')
.description(`
Sends an action to interact with smart contracts

Synthax : node actionCLI.js call -c [ContractName] -t [Task] -a [account] -w [wallet] -p [passwd] -d [Data => '{"key":"value"}']
`)
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

                let walletManager = new WalletManager();
                let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);
                
                data = JSON.parse(data)
                let action = new Action(
                    accountName,
                    "contract",
                    "call",
                {  
                    contractName:contractName,
                    method:task,
                    params:data,
                    account:accountName,
                });
                
                walletManager.unlockWallet(walletName, password)
                .then(async (unlocked)=>{
                    
                    if(unlocked){
                        let signature = await wallet.sign(action.hash)
                        if(signature){
                            action.signature = signature;
                            
                            axios.post(`${address}/action`, action)
                            .then( response => {
                                if(response.data.result){
                                    console.log(response.data.result)
                                }else{
                                    if(response.data.error){
                                        console.log('An error occurred:', response.data.error)
                                    }else{
                                        console.log(`Contract call "${task}" has been succesfully been sent`)
                                        console.log(`Call's action: `, JSON.stringify(response.data, null, 1))
                                    }
                                    
                                }
                                
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
.command('deploy')
.option('-c, --contractName <contractName>', 'Specify the name of the contract to be called')
.option('-f, --filename <filename>', 'Filename of contract. Relative path : "./contract.js" ')
.option('-a, --accountName <accountName>', "Name of the account's owner wallet")
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')
.option('-i, --initParams <initParams>', 'Initial parameters for the deployment of contract')
.description(`
Deploys a contract to the blockchain

Synthax : node actionCLI.js deploy -c [ContractName] -a [account] -w [wallet] -p [passwd] -d [Filename => ./directory/file.js']
`)
.action(()=>{
            let address = program.url;
            let contractName = program.contractName
            let accountName = program.accountName
            let walletName = program.walletName
            let password = program.password
            let filename = program.filename
            let initParams = program.initParams
            
            if(!address) throw new Error('ERROR: URL of receiving node is required')
            if(!accountName) throw new Error('ERROR: Name of sending account is required')
            if(!contractName) throw new Error('ERROR: Name of contract to call is required')
            if(!filename) throw new Error('ERROR: Name of contract file is required')
            if(!walletName) throw new Error('ERROR: Name of owner wallet is required')
            if(!password) throw new Error('ERROR: Password of owner wallet is required')

            openSocket(address, async (socket)=>{
                let contract = fs.readFileSync(filename).toString()
                if(contract){

                    if(!initParams) initParams = {}
                    else if(typeof initParams == 'string'){
                        initParams = JSON.parse(initParams)
                    }
                    initParams.contractAccount = accountName;
                    
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
                        
                        let action = new Action(
                            accountName,
                            "contract",
                            "deploy",
                        {
                            name:contractName,
                            code:contract,
                            contractAPI:result.contractAPI,
                            initParams:initParams,
                            account:accountName,
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
                                        if(response.data.action){
                                            let sentAction = response.data.action;
                                            let result = response.data.value
                                            let API = sentAction.data.contractAPI
                                            let state = sentAction.data.state
                                            console.log(`Successfully Deployed contract ${contractName}\n`)
                                            console.log('Contract API:\n',API)
                                            console.log('\nInitial state of contract:', state)
                                            console.log('\nResult of deployment:', result)
                                        }else{
                                            console.log(response.data)
                                        }
                                        
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
.command('testContract')
.option('-c, --contractName <contractName>', 'Specify the name of the contract to be called')
.option('-f, --filename <filename>', 'Filename of contract. Relative path : "./contract.js" ')
.option('-a, --accountName <accountName>', "Name of the account's owner wallet")
.option('-w, --walletName <walletName>', "Name of the account's owner wallet")
.option('-p, --password <password>', 'Password of owner wallet')
.option('-i, --initParams <initParams>', 'Initial parameters for the deployment of contract')
.description(`
Tests the deployment of a contract before sending it

Synthax : node actionCLI.js testDeploy -c [ContractName] -a [account] -w [wallet] -p [passwd] -i [InitParams => '{"key":"value"}']
`)
.action(()=>{
            let address = program.url;
            let contractName = program.contractName
            let accountName = program.accountName
            let walletName = program.walletName
            let password = program.password
            let filename = program.filename
            let initParams = program.initParams
            
            if(!address) throw new Error('ERROR: URL of receiving node is required')
            if(!accountName) throw new Error('ERROR: Name of sending account is required')
            if(!contractName) throw new Error('ERROR: Name of contract to call is required')
            if(!filename) throw new Error('ERROR: Name of contract file is required')
            if(!walletName) throw new Error('ERROR: Name of owner wallet is required')
            if(!password) throw new Error('ERROR: Password of owner wallet is required')

            openSocket(address, async (socket)=>{
                let contract = fs.readFileSync(filename).toString()
                if(contract){

                    if(!initParams) initParams = {}
                    initParams.contractAccount = accountName;
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
                        
                        let action = new Action(
                            accountName,
                            "contract",
                            "deploy",
                        {
                            name:contractName,
                            code:contract,
                            contractAPI:result.contractAPI,
                            initParams:initParams,
                            account:accountName,
                            state:result.state
                        });
                        
                        walletManager.unlockWallet(walletName, password)
                        .then(async (unlocked)=>{
                            
                            if(unlocked){
                                let signature = await wallet.sign(action.hash)
                                if(signature){
                                    action.signature = signature;
                                    
                                    axios.post(`${address}/testAction`, action)
                                    .then( response => {
                                        if(response.data.action){
                                            let sentAction = response.data.action;
                                            let result = response.data.value
                                            let API = sentAction.data.contractAPI
                                            let state = sentAction.data.state
                                            console.log(`Successfully Deployed contract ${contractName}\n`)
                                            console.log('Contract API:\n',API)
                                            console.log('\nInitial state of contract:', state)
                                            console.log('\nResult of deployment:', result)
                                        }else{
                                            console.log(response.data)
                                        }
                                        
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
.command('destroy')
.description(`
Destroys a contract from the blockchain. Actually, it only blocks its use but does not remove its code.
Can only be sent by the owner account/wallet.

Synthax : node actionCLI.js destroy -c [ContractName] -a [account] -w [wallet] -p [passwd]
`)
.action(()=>{
            let address = program.url;
            let contractName = program.contractName
            let accountName = program.accountName
            let walletName = program.walletName
            let password = program.password
            
            if(!address) throw new Error('ERROR: URL of receiving node is required')
            if(!accountName) throw new Error('ERROR: Name of sending account is required')
            if(!contractName) throw new Error('ERROR: Name of contract to call is required')
            if(!walletName) throw new Error('ERROR: Name of owner wallet is required')
            if(!password) throw new Error('ERROR: Password of owner wallet is required')

            openSocket(address, async (socket)=>{
                

                let walletManager = new WalletManager();
                let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);
                let action = new Action(
                    accountName,
                    "contract",
                    "destroy",
                {
                    name:contractName,
                });
                
                walletManager.unlockWallet(walletName, password)
                .then(async (unlocked)=>{
                    
                    if(unlocked){
                        let signature = await wallet.sign(action.hash)
                        if(signature){
                            action.signature = signature;
                            
                            axios.post(`${address}/action`, action)
                            .then( response => {
                                console.log(response.data)
                                
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
.command('getaccounts <ownerKey>')
.description('Gets all existing accounts on node')
.action(async (ownerKey)=>{
    if(program.url){
        openSocket(program.url, async (socket)=>{
            if(!ownerKey){
                socket.emit('getAllAccounts');
            }else{
                socket.emit('getAllAccounts', ownerKey) 
            }
                
            socket.on('accounts', accounts => console.log(JSON.stringify(accounts, null, 2)))
            
        })
    }else{
        throw new Error('URL of active node is required')
    }
    
})

program.parse(process.argv)