#!/usr/bin/env node

const program = require('commander');
const axios = require('axios')
const Transaction = require('./modules/classes/transactions/transaction')
const WalletManager = require('./modules/classes/wallets/walletManager')
const manager = new WalletManager()
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT

const sendTx = async () =>{
    // let transaction = new Transaction
    // ({
    //     fromAddress:"tuor",
    //     toAddress:"Tokens",
    //     amount:0,
    //     data:{
    //         method:'issue',
    //         cpuTime:5,
    //         params:{
    //             symbol:"GOLD",
    //             amount:1,
    //             receiver:"huor"
    //         }
    //     },
    //     type:"call"
    // });
    // console.log(JSON.stringify(transaction.data))
    let transaction = new Transaction
    ({
        fromAddress:"tuor",
        toAddress:"Tokens",
        amount:0,
        data:{
            method:'getBalanceOfAccount',
            cpuTime:5,
            params:{
                symbol:"HERMETIC",//"GOLD",
                account:"voronwe"
            }
        },
        type:"call"
    });
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