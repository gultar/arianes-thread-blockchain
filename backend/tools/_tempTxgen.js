//To be removed
let txgenCounter = 5000;
let stopTxgen = false;

const WalletManager = require('../classes/walletManager');
const Transaction = require('../classes/transaction');
const manager = new WalletManager();
const axios = require('axios')
const sha1 = require('sha1')

const txgen = (name, password)=>{
    if(name && password){
        if(!stopTxgen){
            
            setInterval(async ()=>{
            
                      let loadedWallet = await manager.loadWallet(`./wallets/${name}-${sha1(name)}.json`);
                      let publicKey = loadedWallet.publicKey;

                if(publicKey){

                      let transaction = new Transaction(publicKey, 'A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R', 0)
                      let wallet = await manager.getWalletByPublicAddress(publicKey);
                      if(wallet){
                        let unlocked = await wallet.unlock(password);
                        if(unlocked){
                          let signature = await wallet.sign(transaction.hash)
                          if(signature){
                            
                            transaction.signature = signature;
                            axios.post('http://localhost:8003/transaction', transaction)
                            .then( res =>{
                                console.log(res.data)
                            })
                            .catch(e =>{
                                console.log(e)
                            })
                          }else{
                            logger('ERROR: Txgen could not sign transaction')
                          }
                        }else{
                          logger('ERROR: Txgen could not unlock wallet')
                        }
                        
                      }else{
                        logger('ERROR: Txgen could not find wallet')
                      }
                      
              }else{
                  logger('ERROR: Missing publicKey')
              }
      
            },3000)
      
          }
    }else{
        console.log('ERROR: Missing parameters')
    }

  }

  module.exports = txgen