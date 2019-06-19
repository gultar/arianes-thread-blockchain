#!/usr/bin/env node

const program = require('commander');
const ioClient = require('socket.io-client');
const axios = require('axios');
const AccountCreator = require('./backend/classes/accountCreator');
const WalletManager = require('./backend/classes/walletManager');
const AccountTable = require('./backend/classes/accountTable');
const Action = require('./backend/classes/action');
const sha1 = require('sha1');

let connected = false
const openSocket = async (address, runFunction) =>{
    let socket = ioClient(address, {'timeout':5000, 'connect_timeout': 5000});
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
.command('action <address> <accountName> <walletName> <password>')
.description('Requests some general information about the blockchain')
.action((address, accountName, walletName, password)=>{

            openSocket(address, async (socket)=>{

                let accountTable = new AccountTable();
                
                let loaded = await accountTable.loadAllAccountsFromFile();
                
                let account = await accountTable.getAccount(accountName)
                
                let walletManager = new WalletManager();
                let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);


                let action = new Action({ 
                    name:account.name, 
                    publicKey:account.ownerKey 
                }, 'getValue', 'action');
                
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