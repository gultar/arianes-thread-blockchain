#!/usr/bin/env node

const program = require('commander');
const fs = require('fs');
const WalletQueryTool = require('./backend/classes/walletQueryTool');
const transactionCreator = require('./backend/tools/transactionCreator');
let api = new WalletQueryTool();
 

const runWalletCLI = async () =>{
  
      
        program
          .command('create <walletName> <password>')
          .description('Creates a new wallet and broadcasts its public key to the network')
          .action(( walletName, password )=>{
            api.createWallet(walletName, password);
          })
    
        program
          .command('load <walletName>')
          .description('Loads and activates a wallet file')
          .action(( walletName)=>{
              api.loadWallet(walletName)
          })

        program
          .command('unlock <walletName> <password> [numberOfSeconds]')
          .description('Gets wallet data')
          .action(( walletName, password, numberOfSeconds)=>{
              api.unlockWallet(walletName, password, numberOfSeconds)
          })
      
        program
          .command('get <walletName>')
          .description('Gets wallet data')
          .action(( walletName )=>{
              api.getWallet(walletName)
          })
          
      
        program
          .command('balance <walletName>')
          .description('Display balance of a wallet')
          .action(( walletName )=>{
            api.getWalletBalance(walletName);
          })
      
        program
          .command('history <walletName>')
          .description('Display balance of a wallet')
          .action(( walletName )=>{
            api.getWalletHistory(walletName);
          })
      
        program
          .command('list')
          .description('List all active wallets')
          .action(()=>{
            api.listWallets();
          })
      
        program
          .command('txget <txhash>')
          .description('get a transaction from either the mempool or the chain')
          .action(( txHash)=>{
            api.getTransaction(txHash);
          })
          

        program
          .command('sendtx')
          .description('Sends a transaction to another wallet')
          .action(async ()=>{
            api.sendTransaction();
          })
          
     
      
      program.parse(process.argv)
}

runWalletCLI();






