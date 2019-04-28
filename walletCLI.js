#!/usr/bin/env node

const program = require('commander');
const chalk = require('chalk');
const axios = require('axios');
const fs = require('fs');
const { readFile, writeToFile } = require('./backend/tools/utils')
const WalletManager = require('./backend/classes/walletManager');
let manager = new WalletManager();

program
.version('0.0.1')
  .option('-h, --help [command]', 'display this message')
  .option('-c, --create <name>', 'Creates a wallet')
  .option('-l, --load <name>', 'Activates a wallet')
  .option('-g, --get <name>', 'Gets an active wallet')

 

const runWalletCLI = async () =>{
  
      const address = await readFile('./config/target');
      if(address){
        program
          .command('create <walletName>')
          .description('Creates a new wallet and broadcasts its public key to the network')
          .action(( walletName)=>{
            manager.createWallet(address, walletName);
          })

        program
          .command('changetarget')
          .description('deletes target address file')
          .action(()=>{
            createTargetFile()
          })

    
        program
          .command('load <walletName>')
          .description('Loads and activates a wallet file')
          .action(( walletName)=>{
              manager.loadWallet(address, walletName)
          })
      
          // program
          // .command('import  <pathToWalletFile>')
          // .description('Imports a wallet file')
          // .action((path, cmd)=>{
      
          // })
      
        program
          .command('get <walletName>')
          .description('Gets wallet data')
          .action(( walletName)=>{
              manager.getWallet(address, walletName)
          })
      
        program
          .command('balance <walletName>')
          .description('Display balance of a wallet')
          .action(( walletName, cmd)=>{
            manager.getWalletBalance(address, walletName);
          })
      
        program
          .command('history <walletName>')
          .description('Display balance of a wallet')
          .action(( walletName, cmd)=>{
            manager.getWalletHistory(address, walletName);
          })
      
        program
          .command('list')
          .description('List all active wallets')
          .action(()=>{
            manager.listWallets(address);
          })
      
        program
          .command('txget <txhash>')
          .description('get a transaction from either the mempool or the chain')
          .action(( txHash)=>{
            manager.getTransaction(address, txHash);
          })
          program.parse(process.argv)
      }else{

      }
  
  
}

const createTargetFile = ()=>{
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  readline.question(`Enter node ip address: `, async (address) => {
    if(address && typeof address == 'string'){
      let success = await writeToFile(address, './config/target');
      if(success){
        console.log('Set target ip address to :', address);
        runWalletCLI();
      }
    }
    readline.close();
    process.exit();
  })
}

fs.exists('./config/target',async (exists)=>{
  if(exists){
    runWalletCLI();
  }else{
    createTargetFile();
    
  }
})





