const Transaction = require('../classes/transactions/transaction')
const Wallet = require('../classes/wallets/wallet')
const axios = require('axios')
const setData = async  () =>{

    let newWallet = new Wallet()
    let wallet = await newWallet.importWalletFromFile('./wallets/8003-b5ac90fbdd1355438a65edd2fabe14e9fcca10ea.json')

    // let data = {
    //     "first":"Principle of mentalism",
    //     "second":"Principle of correspondence",
    //     "third":"Principle of vibration",
    //     "fourth":"Principle of polarity",
    //     "fifth":"Principle of rythm",
    //     "sixth":"Principle of causality",
    //     "seventh":"Principle of gender"
    // }

    let instruction = {
        method:"issue",
        cpuTime:5,
        params:{
            'symbol':"HERMETIC",
            'amount':1,
            "receiver":"voronwe",
        }
    }

    console.log(JSON.stringify(instruction))

    let createHermetic = {
        method:"createToken",
        cpuTime:5,
        params:{
            'symbol':"HERMETIC",
            'maxSupply':10000000000000,
            "name":"hermeticCoin",
        }
    }

    let transaction = new Transaction({
        fromAddress:'tuor',
        toAddress:'Tokens',
        amount:0,
        data:instruction,
        type:'call',

    })

    let unlocked = await wallet.unlock('8003', 2)
    let signature = await wallet.sign(transaction.hash)

    transaction.signature = signature;

    axios.post(`http://127.0.0.1:10003/transaction`, transaction)
    .then( response => {
        console.log(response.data)
        
    })
    .catch(e => console.log(e))
}

setData()
