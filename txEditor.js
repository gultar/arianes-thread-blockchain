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

    let transaction = new Transaction
    ({
        fromAddress:"Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG",
        toAddress:"A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
        amount:1,
        data:{
            method:'get',
            cpuTime:5,
            params:{
                id:"axiom",
            }
        },
        type:""
    });
    
    // // console.log(JSON.stringify(transaction.data))
    // let createHermetic = {
    //     method:"createToken",
    //     cpuTime:5,
    //     params:{
    //         'symbol':"HERMETIC",
    //         'maxSupply':10000000000000,
    //         "name":"hermeticCoin",
    //     }
    // }
    // let getBalance = {
    //     method:'getBalanceOfAccount',
    //     cpuTime:5,
    //     params:{
    //         symbol:"HERMETIC",//"GOLD",
    //         account:"voronwe"
    //     }
    // }
    // let sendCoin = {
    //     method:'issue',
    //     cpuTime:5,
    //     params:{
    //         symbol:"HERMETIC",
    //         amount:1,
    //         receiver:"huor"
    //     }
    // }
    // let transaction = new Transaction
    // ({
    //     fromAddress:"tuor",
    //     toAddress:"Tokens",
    //     amount:0,
    //     data:getBalance,
    //     type:"call"
    // });
    let wallet = await manager.loadByWalletName("8003")
    if(wallet){
        let unlocked = await wallet.unlock("8003")
        if(unlocked){
            let signature = await wallet.sign(transaction.hash);
            if(signature){
                transaction.signature = signature;
                
                if(!program.offline){
                    axios.post(`${nodeAddress}/transaction`, transaction)
                    .then( success => {
                        if(success.data.result) console.log(JSON.stringify(success.data.result, null, 2))
                        else console.log(JSON.stringify(success.data, null, 2))
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

sendTx()