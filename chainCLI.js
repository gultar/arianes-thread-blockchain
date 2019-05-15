#!/usr/bin/env node

const program = require('commander');
const ioClient = require('socket.io-client');
const axios = require('axios');
const AccountCreator = require('./backend/classes/accountCreator');
const WalletManager = require('./backend/classes/walletManager');
const AccountTable = require('./backend/classes/accountTable');
const Transaction = require('./backend/classes/transaction')
const Action = require('./backend/classes/action');
const sha1 = require('sha1');

//Commands to implement
//Version
/*Get  
- wallet
- info Get current blockchain information
- block Retrieve a full block from the blockchain
- account Retrieve an account from the blockchain
- code Get code of a contract
- table Retrieve the contents of a database table
- currency Retrieve information related to standard currencies
- accounts Retrieve accounts associated with a public key
- transaction Retrieve a transaction from the blockchain
- actions Retrieve all actions with specific account name referenced in authorization or receiver
- schedule Retrieve the producer schedule
*/
/**
 * Create
 * - wallet
 * - account
 * 
 */
/**
 * Set
 * - contract
 * - account permission
 * - action permission
 * - 
 */

/**Transfer
 * - basic coins
 * - created coins
 */
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
.command('getinfo <address>')
.description('Requests some general information about the blockchain')
.action((address)=>{
    openSocket(address, (socket)=>{
            socket.emit('getInfo');
            socket.on('chainInfo', (info)=>{
                console.log(JSON.stringify(info, null, 2))
                socket.close()
            })
        
    })
})

program
.command('getblock <address> <blockNumber>')
.description('Requests some general information about the blockchain')
.action((address, blockNumber)=>{
    openSocket(address, (socket)=>{
            socket.emit('getBlock', blockNumber);
            socket.on('block', (block)=>{
                console.log(JSON.stringify(block, null, 2))
                socket.close()
            })
        
    })
})

program
.command('createaccount <address> <name> <walletName> <password>')
.description('Requests some general information about the blockchain')
.action((address, name, walletName, password)=>{
    openSocket(address, async (socket)=>{
            let accountCreator = new AccountCreator();
            let walletManager = new WalletManager();

            let newAccount = await accountCreator.createAccount(name, walletName, password);
            let wallet = await walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`);

            let action = new Action({ 
                name:newAccount.name, 
                publicKey:newAccount.ownerKey 
            }, 'createAccount', 'create', newAccount);
            
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


program.parse(process.argv)

//verbose
//update
//stopMining
//mine
//get Info
//get KnownPeers
//get Block
//get Transaction
//get Action
//get Contract
//get Account
//get PublicKey
//get LongestChain
//get Active Nodes


//push Transaction
//push Action
//push Contract

//create Account
//create Contract
//create Action

//


