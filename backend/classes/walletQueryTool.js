const chalk = require('chalk');
const axios = require('axios');
const transactionCreator = require('../tools/transactionCreator');
const WalletManager = require('./walletManager');
const walletManager = new WalletManager()
const sha1 = require('sha1')

class WalletQueryTool{
    constructor(){

    }
    createWallet(walletName, password){

        if(walletName && password){
            
              if(walletName && password){
                walletManager.createWallet(walletName, password)
                .then((wallet)=>{
                  if(wallet){
                    console.log(wallet)
                  }else{
                    console.log('ERROR: Wallet creation failed');
                  }
                  
                })
                .catch(e =>{
                  console.log(e)
                })
              }else{
                console.log('ERROR: No wallet name or password provided')
              }
        
      }
       
    }

    // loadWallet(walletName){

    //     if(walletName){
    //         axios.get('http://localhost:3000/loadWallet', {params:{
    //             name:walletName
    //           }}).then((response)=>{
    //             let walletInfo = response.data;
    //             if(walletInfo){
    //               if(typeof walletInfo == 'string'){
    //                 console.log(walletInfo)
    //               }else{
    //                 walletInfo = JSON.stringify(walletInfo, null, 2);
    //                 console.log(walletInfo)
    //               }
                  
    //             }
                
    //           }).catch((e)=>{
    //             console.log(chalk.red(e))
    //           })
    //     }else{
    //         logger('ERROR: missing parameters')
    //     }
        
    // }

    // unlockWallet(walletName, password, seconds=5){
    //   if(walletName && password){
        
    //         axios.post('http://localhost:3000/unlockWallet', {
    //           name:walletName,
    //           password:password,
    //           seconds:seconds
    //         }).then((response)=>{
    //           console.log(response.data)
    //         }).catch((e)=>{
    //           console.log(chalk.red(e))
    //         })

    //   }else{
    //       console.log('ERROR: missing parameters')
    //   }
    // }

    async getWallet(walletName){

        if(walletName){
            let wallet = await walletManager.loadByWalletName(walletName);
            if(wallet){
              console.log(wallet);
            }else{
              console.log({error:`wallet ${walletName} not found`})
            }
        
        }else{
            logger('ERROR: must provide wallet name')
        }
       
    }

    async getWalletBalance(walletName, address){

        if(walletName && address){
              let wallet = await walletManager.loadByWalletName(walletName);
              if(wallet){
                axios.get(`${address}/getWalletBalance`, {params:{
                  publicKey:wallet.publicKey
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
                console.log('ERROR: Could not find wallet')
              }
              
        }else{
            logger('ERROR: missing parameters')
        }
        
    }

    async getWalletHistory(walletName, address){

        if(walletName && address){
          let wallet = await walletManager.loadByWalletName(walletName);
          if(wallet){
            axios.get(`${address}/getWalletHistory`, {params:{
              publicKey:wallet.publicKey
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
            console.log('ERROR: Could not find wallet')
          }
        }else{
            logger('ERROR: missing parameters')
        }
        
    }

    // listWallets(){
        
    //         axios.get('http://localhost:3000/listWallets')
    //         .then((response)=>{
    //           let walletInfo = response.data;
    //           if(walletInfo){
    //             if(typeof walletInfo == 'string'){
    //               console.log(walletInfo)
    //             }else{
    //               walletInfo = JSON.stringify(walletInfo, null, 2);
    //               console.log(walletInfo)
    //             }
                
    //           }
              
    //         }).catch((e)=>{
    //           console.log(chalk.red(e))
    //         })
        
    // }

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

    // async sendRawTransaction(transaction, walletName, password){
    //   return new Promise(async (resolve, reject)=>{
    //     let wallet = await  walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`)
        
    //     if(wallet){
    //           let unlocked = await wallet.unlock(password);
    //           if(unlocked){
    //               let signature = await wallet.sign(transaction.hash)
    //               if(signature){
    //                   transaction.signature = signature;
    //                   axios.post('http://localhost:3000/transaction', transaction)
    //                   .then((response)=>{
    //                     console.log(response.data)
    //                     resolve(true)

    //                   }).catch((e)=>{
    //                     console.log(chalk.red(e))
    //                     resolve(false)
    //                   })
    //               }else{
    //                   console.log('ERROR: Could not sign transaction')
    //                   resolve(false)
    //               }
    //           }else{
    //               console.log('ERROR: Could not unlock wallet')
    //               resolve(false)
    //           }
              
    //       }else{
    //           console.log(`ERROR: Wallet not found`)
    //           resolve(false)
    //       }
    //     })
      
    // }

}

module.exports = WalletQueryTool