#!/usr/bin/env node

const program = require('commander');
const fs = require('fs');
const WalletQueryTool = require('./backend/classes/walletQueryTool');
const txgen = require('./backend/tools/_tempTxgen');
let api = new WalletQueryTool();
 
//Commands to implement
//Version
/*Get  
- wallet
- info Get current blockchain information
- block Retrieve a full block from the blockchain
- account Retrieve an account from the blockchain
- code Get code of a contract
- table Retrieve the contents of a database table
- currency Retrieve information related to standard currencies
- accounts Retrieve accounts associated with a public key
- transaction Retrieve a transaction from the blockchain
- actions Retrieve all actions with specific account name referenced in authorization or receiver
- schedule Retrieve the producer schedule
*/
/**
 * Create
 * - wallet
 * - account
 * 
 */
/**
 * Set
 * - contract
 * - account permission
 * - action permission
 * - 
 */

/**Transfer
 * - basic coins
 * - created coins
 */


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
          .command('createAccount <accountName> <walletName> <password>')
          .description('Creates a new wallet and broadcasts its public key to the network')
          .action(( accountName, walletName, password )=>{
            api.createWallet(walletName, password);
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

        program
          .command('txgen <walletName> <password>')
          .description('TEMP: Transaction generator')
          .action((walletName, password)=>{
            txgen(walletName, password)
          })

          
     
      
      program.parse(process.argv)
}

runWalletCLI();






