#!/usr/bin/env node

const program = require('commander');
const axios = require('axios')
const FaucetTransaction = require('./modules/classes/transactions/faucetTransaction')
const WalletManager = require('./modules/classes/wallets/walletManager')
const manager = new WalletManager()
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT
const ioClient = require('socket.io-client');




const parseDataArgument = (dataString) =>{
    return new Promise((resolve)=>{
        if(typeof dataString == 'string'){
            try{
                let data = JSON.parse(dataString);
                resolve(data)
            }catch(e){
                resolve(false)
            }
        }
    })
}

const openSocket = async (address, runFunction) =>{
    let socket = ioClient(address, {'timeout':1000, 'connect_timeout': 1000});
    
    if(socket){
        runFunction(socket);
    }else{
        console.log('Could not connect to node')
    }
}

program
.option('-w, --walletName <walletName>', "Sender's wallet name")
.option('-p, --password <password>', "Sender's wallet password")
.option('-f, --fromAddress <fromAddress>', "Sender's public key")
.option('-t, --toAddress <toAddress>', "Receiver's public key")
.option('-a, --amount <amount>', "Amount of coins to be transfered")
.option('-o, --offline', 'Print out a transaction without sending it')
.description('Funds a wallet by requesting coins from faucet')
.action(async ()=>{
    console.log('Sending to ', nodeAddress)
    if(program.walletName && program.password && nodeAddress){
        if(program.fromAddress){
            if(program.toAddress){
                if(program.amount){
                    var amount = JSON.parse(program.amount);
                    
                    let data = ''
                    if(program.data){
                        data = await parseDataArgument(program.data)
                    }
                    
                    let transaction = new FaucetTransaction
                        ({
                            toAddress:program.toAddress,
                            amount:amount,
                            data:data,
                            type:program.type
                        });
                        let wallet = await manager.loadByWalletName(program.walletName)
                        if(wallet){
                            let unlocked = await wallet.unlock(program.password)
                            if(unlocked){
                                let signature = await wallet.sign(transaction.hash);
                                if(signature){
                                    transaction.signature = signature;
                                    
                                    if(!program.offline){
                                        openSocket(`${nodeAddress}`, (socket)=>{
                                            socket.emit('transaction', transaction)

                                        })

                                        // axios.post(`${nodeAddress}/transaction`, transaction)
                                        // .then( success => {
                                        //     if(success.data.result) console.log(JSON.stringify(success.data.result, null, 2))
                                        //     else console.log(JSON.stringify(success.data, null, 2))
                                        // })
                                        // .catch( e => console.log(e))
                                    }else{
                                        console.log(JSON.stringify(transaction, null, 2))
                                    }
                                }else{
                                    console.log('ERROR: Could not sign transaction')
                                }
                            }else{
                                console.log('ERROR: Could not unlock wallet')
                            }
                        }else{
                            console.log('ERROR: Could not find wallet')
                        }
                        
                }else{
                    console.log('ERROR: Need to provide amount to transfer')
                }
            }else{
                console.log('ERROR: Need to provide receiving address')
            }
        }else{
            console.log('ERROR: Need to provide sender address')
        }
    }else{
        console.log('ERROR: Need to provide wallet name & password')
    }
})



program.parse(process.argv)