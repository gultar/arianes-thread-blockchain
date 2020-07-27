#!/usr/bin/env node

const program = require('commander');
const axios = require('axios')
const ioClient = require('socket.io-client');
const Transaction = require('./modules/classes/transactions/transaction')
const WalletManager = require('./modules/classes/wallets/walletManager')
const manager = new WalletManager()
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
let nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT
// nodeAddress = `http://localhost:9000`

const openSocket = async (address, runFunction) =>{
    let socket = ioClient(address, {'timeout':1000, 'connect_timeout': 1000});
    
    if(socket){
        runFunction(socket);
    }else{
        console.log('Could not connect to node')
    }
}


const sendTx = async () =>{
    let setValue = {
        "first":"Principle of mentalism",
        "second":"Principle of correspondence",
        "third":"Principle of vibration",
        "fourth":"Principle of polarity",
        "fifth":"Principle of rythm",
        "sixth":"Principle of causality",
        "seventh":"Principle of gender"
    }

    
    
    
    let createHermetic = {
        method:"createToken",
        cpuTime:5,
        params:{
            'symbol':"HERMETIC2",
            'maxSupply':10000000000000,
            "name":"hermeticCoin",
        }
    }
    let getBalance = {
        method:'getBalanceOfAccount',
        cpuTime:5,
        params:{
            symbol:"HERMETIC",//"GOLD",
            account:"mary"
        }
    }
    let sendCoin = {
        method:'issue',
        cpuTime:5,
        params:{
            symbol:"HERMETIC2",
            amount:1,
            receiver:"john"
        }
    }
    let tx1 = new Transaction
    ({
        fromAddress:"tom",
        toAddress:"Tokens",
        amount:0,
        data:createHermetic,
        type:"call"
    });

    let tx2 = new Transaction
    ({
        fromAddress:"tom",
        toAddress:"Tokens",
        amount:0,
        data:sendCoin,
        type:"call"
    });
    let tx3 = new Transaction
    ({
        fromAddress:"tom",
        toAddress:"Storage",
        amount:0,
        data:{
            method:'set',
            cpuTime:5,
            params:{
                id:"principles",
                data:setValue
            }
        },
        type:"call"
    });
    // console.log(JSON.stringify(transaction.data))
    let payload = {}
    let sha256 = require('./modules/tools/sha256')

    let key = Date.now() * 10000000
    let value = Date.now() * 1000
    let id = "Chump"
    payload = {
        ...payload,
        [sha256(key.toString())] : sha256((value.toString()))
    }
    let tx4 = new Transaction
    ({
        fromAddress:"tom",
        toAddress:"Storage",
        amount:0,
        data:{
            method:'set',
            cpuTime:5,
            params:{
                id:sha256((id)),
                data:payload
            }
        },
        type:"call"
    });

    let transactions = [tx1, tx2, tx3, tx4]

    const signTxs = async()=>{
        openSocket(`${nodeAddress}`, async(socket)=>{
            let wallet = await manager.loadByWalletName("8000")
            if(wallet){
                let unlocked = await wallet.unlock("8000")
                if(unlocked){
                    socket.on('transactionEmitted', (result)=>{
                        console.log(result)
                    })
                    for await(let transaction of transactions){
                        let signature = await wallet.sign(transaction.hash);
                        if(signature){
                            transaction.signature = signature;
                            if(!program.offline){
                                socket.emit('transaction', transaction)
                                
                            }else{
                                console.log(JSON.stringify(transaction, null, 2))
                            }
                            
                        }else{
                            console.log('ERROR: Could not sign transaction')
                        }
                    }
    
                    
                }else{
                    console.log('ERROR: Could not unlock wallet')
                }
            }else{
                console.log('ERROR: Could not find wallet')
            } 
                                
        })
        


    }

    signTxs()
    // setInterval(async ()=>{
 
    // }, 1000)
}

sendTx()