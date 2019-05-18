const chalk = require('chalk');
const axios = require('axios');
const transactionCreator = require('../tools/transactionCreator');
const WalletManager = require('./walletManager');
const walletManager = new WalletManager()
const sha1 = require('sha1')

class WalletQueryTool{
    constructor(){

    }
    createWallet(walletName, pass){

        if(walletName && pass){
          
              axios.post('http://localhost:3000/createWallet', {
                name:walletName,
                password:pass
              }).then((response)=>{
                console.log(response.data)
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
        }else{
            logger('ERROR: missing parameters')
        }
       
    }

    loadWallet(walletName){

        if(walletName){
            axios.get('http://localhost:3000/loadWallet', {params:{
                name:walletName
              }}).then((response)=>{
                let walletInfo = response.data;
                if(walletInfo){
                  if(typeof walletInfo == 'string'){
                    console.log(walletInfo)
                  }else{
                    walletInfo = JSON.stringify(walletInfo, null, 2);
                    console.log(walletInfo)
                  }
                  
                }
                
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
        }else{
            logger('ERROR: missing parameters')
        }
        
    }

    unlockWallet(walletName, password, seconds=5){
      if(walletName && password){
        
            axios.post('http://localhost:3000/unlockWallet', {
              name:walletName,
              password:password,
              seconds:seconds
            }).then((response)=>{
              console.log(response.data)
            }).catch((e)=>{
              console.log(chalk.red(e))
            })

      }else{
          console.log('ERROR: missing parameters')
      }
    }

    getWallet(walletName){

        if(walletName){
            axios.get('http://localhost:3000/getWalletPublicInfo', {params:{
                name:walletName
              }}).then((response)=>{
                let walletInfo = response.data;
                if(walletInfo){
                  if(typeof walletInfo == 'string'){
                    console.log(walletInfo)
                  }else{
                    walletInfo = JSON.stringify(walletInfo, null, 2);
                    console.log(walletInfo)
                  }
                  
                }
                
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
        }else{
            logger('ERROR: missing parameters')
        }
       
    }

    getWalletBalance(walletName){

        if(walletName){
            axios.get('http://localhost:3000/getWalletBalance', {params:{
                name:walletName
              }})
              .then((response)=>{
                let walletInfo = response.data;
                if(walletInfo){
                  if(typeof walletInfo == 'string'){
                    console.log(walletInfo)
                  }else{
                    walletInfo = JSON.stringify(walletInfo, null, 2);
                    console.log(walletInfo)
                  }
                  
                }
                
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
        }else{
            logger('ERROR: missing parameters')
        }
        
    }

    getWalletHistory(walletName){

        if(walletName){
            axios.get('http://localhost:3000/getWalletHistory', {params:{
                name:walletName
              }})
              .then((response)=>{
                let walletInfo = response.data;
                if(walletInfo){
                  if(typeof walletInfo == 'string'){
                    console.log(walletInfo)
                  }else{
                    walletInfo = JSON.stringify(walletInfo, null, 2);
                    console.log(walletInfo)
                  }
                  
                }
                
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
        }else{
            logger('ERROR: missing parameters')
        }
        
    }

    listWallets(){
        
            axios.get('http://localhost:3000/listWallets')
            .then((response)=>{
              let walletInfo = response.data;
              if(walletInfo){
                if(typeof walletInfo == 'string'){
                  console.log(walletInfo)
                }else{
                  walletInfo = JSON.stringify(walletInfo, null, 2);
                  console.log(walletInfo)
                }
                
              }
              
            }).catch((e)=>{
              console.log(chalk.red(e))
            })
        
    }

    getTransaction(txHash){
        axios.get('http://localhost:3000/transaction', {
            params:{
              hash:txHash
            }
          })
          .then((response)=>{
            let txInfo = response.data;
            if(txInfo){
              if(typeof txInfo == 'string'){
                console.log(txInfo)
              }else{
                txInfo = JSON.stringify(txInfo, null, 2);
                console.log(txInfo)
              }
              
            }
            
          }).catch((e)=>{
            console.log(chalk.red(e))
          })
    }

    async sendTransaction(){
      await transactionCreator()
    }

    async sendRawTransaction(transaction, walletName, password){
      return new Promise(async (resolve, reject)=>{
        let wallet = await  walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`)
        
        if(wallet){
              let unlocked = await wallet.unlock(password);
              if(unlocked){
                  let signature = await wallet.sign(transaction.hash)
                  if(signature){
                      transaction.signature = signature;
                      axios.post('http://localhost:3000/transaction', transaction)
                      .then((response)=>{
                        console.log(response.data)
                        resolve(true)

                      }).catch((e)=>{
                        console.log(chalk.red(e))
                        resolve(false)
                      })
                  }else{
                      console.log('ERROR: Could not sign transaction')
                      resolve(false)
                  }
              }else{
                  console.log('ERROR: Could not unlock wallet')
                  resolve(false)
              }
              
          }else{
              console.log(`ERROR: Wallet not found`)
              resolve(false)
          }
        })
      
    }

}

module.exports = WalletQueryTool