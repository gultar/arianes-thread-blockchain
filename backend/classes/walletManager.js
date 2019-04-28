const program = require('commander');
const chalk = require('chalk');
const axios = require('axios')

class WalletManager{
    constructor(){}
    createWallet(address, walletName){

        if(address, walletName){
            axios.post(address+'/createWallet', {
                name:walletName
              }).then((response)=>{
                console.log(response.data)
              }).catch((e)=>{
                console.log(chalk.red(e))
              })
        }else{
            logger('ERROR: missing parameters')
        }
       
    }

    loadWallet(address, walletName){

        if(address, walletName){
            axios.get(address+'/loadWallet', {params:{
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

    getWallet(address, walletName){

        if(address, walletName){
            axios.get(address+'/getWalletPublicInfo', {params:{
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

    getWalletBalance(address, walletName){

        if(address, walletName){
            axios.get(address+'/getWalletBalance', {params:{
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

    getWalletHistory(address, walletName){

        if(address, walletName){
            axios.get(address+'/getWalletHistory', {params:{
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

    listWallets(address){
        if(address){
            axios.get(address+'/listWallets')
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
    }

    getTransaction(address, txHash){
        axios.get(address+'/transaction', {
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

    sendTransaction(address, sender, receiver, amount, data){
        if(sender && receiver && amount){
            try{
                var transactToSend = {
                    'sender' : sender,
                    'receiver' : receiver,
                    'amount' : amount,
                    'data' : data
                }

                if(typeof transactToSend.amount == 'string'){
                    transactToSend.amount = parseInt(transactToSend.amount);
                }

                if(!transactToSend.data){
                    transactToSend.data = ' '
                }

                axios.post(address+'/transaction', transactToSend)
                .then((response)=>{
                    console.log(response.data)
                  }).catch((e)=>{
                    console.log(chalk.red(e))
                  })
    
            }catch(e){
                console.log(e);
            }
            
        }else{
            logger('ERROR: Need to provide sender, receiver and amount when sending a transaction');
            
        }
        
    }
}

module.exports = WalletManager