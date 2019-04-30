#!/usr/bin/env node

const program = require('commander');
const chalk = require('chalk');
const axios = require('axios');
const fs = require('fs');
const { readFile, writeToFile, createTargetFile } = require('./backend/tools/utils')
const WalletManager = require('./backend/classes/walletManager');
const transactionCreator = require('./transactionCreator');
let manager = new WalletManager();

 

const runWalletCLI = async () =>{
  
      const address = await readFile('./config/target');
      if(address){
        program
          .command('create <walletName> <password>')
          .description('Creates a new wallet and broadcasts its public key to the network')
          .action(( walletName, password )=>{
            manager.createWallet(address, walletName, password);
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

        program
          .command('unlock <walletName> <password>')
          .description('Gets wallet data')
          .action(( walletName, password)=>{
              manager.unlockWallet(address, walletName, password)
          })
      
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
          

        program
          .command('sendtx')
          .description('Sends a transaction to another wallet')
          .action(async ()=>{
            await transactionCreator(address)
          })
          
      }else{

      }
      
      program.parse(process.argv)
}


fs.exists('./config/target',async (exists)=>{
  if(exists){
    runWalletCLI();
  }else{
    createTargetFile('./config/target');
    
  }
})





