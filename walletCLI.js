#!/usr/bin/env node

const program = require('commander');
const chalk = require('chalk');
const axios = require('axios')

program
.version('0.0.1')
  .option('-h, --help [command]', 'display this message')
  .option('-c, --create <name>', 'Creates a wallet')
  .option('-l, --load <name>', 'Activates a wallet')
  .option('-g, --get <name>', 'Gets an active wallet')

program
.command('create <address> <walletName>')
.description('Creates a new wallet and broadcasts its public key to the network')
.action((address, walletName, cmd)=>{
  axios.post(address+'/createWallet', {
    name:walletName
  }).then((response)=>{
    console.log(response.data)
  }).catch((e)=>{
    console.log(chalk.red(e))
  })
})

program
.command('load <address> <walletName>')
.description('Loads and activates a wallet file')
.action((address, walletName, cmd)=>{
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
})

// program
// .command('import <address> <pathToWalletFile>')
// .description('Imports a wallet file')
// .action((path, cmd)=>{

// })

program
.command('get <address> <walletName>')
.description('Gets wallet data')
.action((address, walletName, cmd)=>{
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
})

program
.command('balance <address> <walletName>')
.description('Display balance of a wallet')
.action((address, walletName, cmd)=>{
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
})

program
.command('history <address> <walletName>')
.description('Display balance of a wallet')
.action((address, walletName, cmd)=>{
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
})

program
.command('list <address>')
.description('List all active wallets')
.action((address)=>{
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
})
program.parse(process.argv)