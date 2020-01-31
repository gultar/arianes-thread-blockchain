#!/usr/bin/env node

const program = require('commander');
const ioClient = require('socket.io-client');
const ECDSA = require('ecdsa-secp256r1');
const activePort = require('dotenv').config({ path: './config/.env' })

if (activePort.error) {
    throw activePort.error
}

const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT
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
    let socket = ioClient(address);
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
.option('-u, --url <nodeURL>', "URL of running node to send transaction to")
.option('-y, --yes', 'Skip prompt')

program
.command('getinfo')
.description('Requests some general information about the blockchain')
.action(()=>{
    if(nodeAddress){
        openSocket(nodeAddress, (socket)=>{
            socket.on('message', message => console.log(message))
            socket.emit('getInfo');
            socket.on('chainInfo', (info)=>{
                console.log(JSON.stringify(info, null, 2))
                socket.close()
            })
        
        })
    }else{
        console.log('ERROR: Missing node address')
    }
    
})

program
.command('getblock <blockNumber>')
.description('Requests some general information about the blockchain')
.action((blockNumber)=>{
    if(nodeAddress){
        openSocket(nodeAddress, (socket)=>{
                socket.emit('getBlock', blockNumber);
                socket.on('block', (block)=>{
                    console.log(JSON.stringify(block, null, 2))
                    socket.close()
                })
            
        })
    }else{
        console.log('ERROR: Missing node address')
    }
})

program
.command('getheader <blockNumber>')
.description('Requests some general information about the blockchain')
.action((blockNumber)=>{
    if(nodeAddress){
        openSocket(nodeAddress, (socket)=>{
                socket.emit('getBlockHeader', blockNumber);
                socket.on('header', (block)=>{
                    console.log(JSON.stringify(block, null, 2))
                    socket.close()
                })
            
        })
    }else{
        console.log('ERROR: Missing node address')
    }
})

program
.command('rollback <blockNumber>')
.description('Roll back to previous on the chain, reverting the state of transactions, actions, contracts and accounts ')
.action((blockNumber)=>{
    if(nodeAddress){
        openSocket(nodeAddress, (socket)=>{
                socket.emit('rollback', blockNumber);
                socket.on('rollbackResult', (result)=>{
                    console.log(`Rolled back to block ${blockNumber}`)
                    socket.close()
                })
            
        })
    }else{
        console.log('ERROR: Missing node address')
    }
})

program
.command('update')
.description('Roll back to previous on the chain, reverting the state of transactions, actions, contracts and accounts ')
.action(()=>{
    if(nodeAddress){
        openSocket(nodeAddress, (socket)=>{
                socket.emit('update');
                setTimeout(()=>{
                    socket.close()
                }, 1000)
            
        })
    }else{
        console.log('ERROR: Missing node address')
    }
})

program
.command('validate')
.description('Validates the enter blockchain. Returns the conflicting block if there is one')
.action(()=>{
    if(nodeAddress){
        openSocket(nodeAddress, (socket)=>{
                socket.emit('isChainValid');
                setTimeout(()=>{
                    socket.close()
                }, 1000)
            
        })
    }else{
        console.log('ERROR: Missing node address')
    }
})

program
.command('getstate <contractName> [blockNumber]')
.description('Get state of contract at a given block hash')
.action((contractName, blockNumber=0)=>{
    if(nodeAddress){
        openSocket(nodeAddress, (socket)=>{
                socket.emit('getContractState', blockNumber, contractName);
                socket.on('contractState', (state)=>{
                    console.log(JSON.stringify(state, null, 2))
                    socket.close()
                })
            
        })
    }else{
        console.log('ERROR: Missing node address')
    }
})

program
.command('reset')
.description('Requests some general information about the blockchain')
.option('-y, --yes', 'Skip prompt')
.action(()=>{
    const inquirer = require('inquirer');
    const { exec } = require('child_process');
    let validation = {
        type: 'input', name: 'validation', message: 'Are you sure you want to delete all blockchain files? ("yes" or "no")' 
    }
    if(program.yes){
        exec('rm -r -f databases/*',(err, stdout, stderr)=>{
            if (err) {
              // node couldn't execute the command
              return;
            }
            console.log('Deleted all blockchain files')
            // the *entire* stdout and stderr (buffered)
            if(stdout) console.log(`stdout: ${stdout}`);
            if(stderr) console.log(`stderr: ${stderr}`);
            
          });
    }else{
        inquirer.prompt(validation)
        .then((answer)=>{
            if(answer.validation == 'yes' || answer.validation == 'y' || answer.validation == '1'){
                // exec('rm data/chainDB/* data/mempool.json data/balances.json data/lastBlock.json data/stateDB/* data/accountsDB/* data/cpuTimeAllocationsDB/* data/memAllocationsDB/* data/contractDB/* data/contractStateDB/* data/accounts.json data/transactionDB/* data/actionDB/* data/balanceDB/*', (err, stdout, stderr) => {
                    exec('rm -r -f databases/*',(err, stdout, stderr)=>{
                        if (err) {
                        // node couldn't execute the command
                        return;
                        }
                        console.log('Deleted all blockchain files')
                        // the *entire* stdout and stderr (buffered)
                        if(stdout) console.log(`stdout: ${stdout}`);
                        if(stderr) console.log(`stderr: ${stderr}`);
                        
                    });
            }else{
                console.log('Blockchain files were left untouched')
            }
            
        })
    }
    
    
})

program
.command('testSign <wallet> <password>')
.description('Requests some general information about the blockchain')
.action((walletname, password)=>{
    walletManager.unlockWallet(walletName, password)
    .then(async (unlocked)=>{
        
        if(unlocked){
            let signature = await wallet.sign('Je ne sais pas pourquoi il rejette ma transaction')
            if(signature){
                
            }else{
                console.log('ERROR: Could not sign action')
            }
            

        }else{
            console.log('ERROR: Could not unlock wallet')
        }
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


