const Action = require('../../../classes/action')
const Wallet = require('../../../classes/wallet')
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
        contractName: "Token",
        method:"issue",
        account:'tuor',
        params:{
            'symbol':"hermeticCoin",
            'amount':10000,
            "receiver":"voronwe",
        }
    }

    let action = new Action('tuor', 'contract', 'call', instruction)
    let unlocked = await wallet.unlock('8003', 2)
    let signature = await wallet.sign(action.hash)

    action.signature = signature;

    axios.post(`http://127.0.0.1:10003/action`, action)
    .then( response => {
        console.log(response.data)
        
    })
    .catch(e => console.log(e))
}

setData()
