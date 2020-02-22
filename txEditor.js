#!/usr/bin/env node

const program = require('commander');
const axios = require('axios')
const Transaction = require('./modules/classes/transactions/transaction')
const WalletManager = require('./modules/classes/wallets/walletManager')
const manager = new WalletManager()
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
let nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT
// nodeAddress = `http://localhost:9000`
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

    
    
    
    // let createHermetic = {
    //     method:"createToken",
    //     cpuTime:5,
    //     params:{
    //         'symbol':"HERMETIC",
    //         'maxSupply':10000000000000,
    //         "name":"hermeticCoin",
    //     }
    // }
    let getBalance = {
        method:'getBalanceOfAccount',
        cpuTime:10,
        params:{
            symbol:"GOLD",//"GOLD",
            account:"huor"
        }
    }
    let sendCoin = {
        method:'issue',
        cpuTime:5,
        params:{
            symbol:"GOLD",
            amount:1,
            receiver:"huor"
        }
    }
    let tx1 = new Transaction
    ({
        fromAddress:"tuor",
        toAddress:"Tokens",
        amount:0,
        data:sendCoin,
        type:"call"
    });

    let sha256 = require('./modules/tools/sha256')

    let key = Date.now() * 10000000
    let value = Date.now() * 1000
    let id = "muppet"
    
    let tx2 = new Transaction
    ({
        fromAddress:"tuor",
        toAddress:"Storage",
        amount:0,
        data:{
            method:'set',
            cpuTime:5,
            params:{
                id:sha256((id)),
                data:{
                    [sha256(key.toString())] : sha256((value.toString()))
                }
            }
        },
        type:"call"
    });

    let tx3 = new Transaction
    ({
        fromAddress:"tuor",
        toAddress:"Escrow",
        amount:0,
        data:{
            method:'accept',
            cpuTime:10,
            params:{
                id:'first',
                buyer:'huor',
                seller:'tuor',
            }
        },
        type:"call"
    });

    let tx4 = new Transaction
    ({
        fromAddress:"tuor",
        toAddress:"Tokens",
        amount:0,
        data:getBalance,
        type:"call"
    });

    let transactions = [tx4,tx1, tx2, tx3, ]

    for await(let transaction of transactions){
        let wallet = await manager.loadByWalletName("8003")
        if(wallet){
            let unlocked = await wallet.unlock("8003")
            if(unlocked){
                let signature = await wallet.sign(transaction.hash);
                if(signature){
                    transaction.signature = signature;
                    
                    if(!program.offline){
                        // console.log(transaction.data)
                        axios.post(`${nodeAddress}/transaction`, transaction)
                        .then( success => {
                            console.log(success.data)
                            // if(success.data.result) console.log(JSON.stringify(success.data.result, null, 2))
                            // else console.log(JSON.stringify(success.data, null, 2))
                        })
                        .catch( e => console.log(e))
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
    }
}

setInterval(sendTx, 500)