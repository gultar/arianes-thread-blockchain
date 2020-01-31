const chalk = require('chalk');
const axios = require('axios');
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

    async getWalletBalanceOfPublicKey(publicKey, address){

      if(publicKey && address){
           
              axios.get(`${address}/getWalletBalance`, {params:{
                publicKey:publicKey
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

    async getWalletHistoryOfPublicKey(publicKey, address){

      if(publicKey && address){
           
              axios.get(`${address}/getWalletHistory`, {params:{
                publicKey:publicKey
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



}

module.exports = WalletQueryTool