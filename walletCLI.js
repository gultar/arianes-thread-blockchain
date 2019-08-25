#!/usr/bin/env node
const ECDSA = require('ecdsa-secp256r1');
const program = require('commander');
const fs = require('fs');
const WalletQueryTool = require('./backend/classes/walletQueryTool');
const WalletManager = require('./backend/classes/walletManager');
const walletManager = new WalletManager()
const sha1 = require('sha1')
const Transaction = require('./backend/classes/transaction');
const { readFile, validatePublicKey } = require('./backend/tools/utils');
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
          .option('-u, --url <url>', 'URL of running node to send commands to')
      
        program
          .command('create <walletName> <password>')
          .description('Creates a new wallet and broadcasts its public key to the network')
          .action(( walletName, password )=>{
            api.createWallet(walletName, password);
          })
  
      
        program
          .command('get <walletName>')
          .description('Gets wallet data')
          .action(( walletName )=>{
              api.getWallet(walletName)
          })
          
      
        program
          .command('balance <publicKey>')
          .description('Displays balance of a wallet')
          .action(async ( publicKey )=>{
            if(program.url){
              api.getWalletBalanceOfPublicKey(publicKey, program.url);
              
            }else{
              console.log('Need to provide URL of running node')
            }
            
          })
      
        program
          .command('history <walletName>')
          .description('Displays history of a wallet')
          .action(( walletName )=>{
            if(program.url){
              api.getWalletHistory(walletName, program.url);
            }else{
              console.log('Need to provide URL of running node')
            }
            
          })

      
        program
          .command('txget <txhash>')
          .description('get a transaction from either the mempool or the chain')
          .action(( txHash)=>{
            api.getTransaction(txHash);
          })
          

        program
          .command('txmenu')
          .description('Sends a transaction to another wallet')
          .action(async ()=>{
            api.sendTransaction();
          })

        program
          .command('sign <data> <walletName> <password>')
          .description('Generates a signature of selected data')
          .action(async (data, walletName, password)=>{
              if(walletName && password && data){
                let wallet = await  walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`)
                if(wallet){
                  let unlocked = await wallet.unlock(password);
                        if(unlocked){
                            let signature = await wallet.sign(data)
                            if(signature){
                                console.log(signature)  
                            }else{
                                console.log('ERROR: Could not sign')
                                
                            }
                        }else{
                            console.log('ERROR: Could not unlock wallet')
                            
                        }
                }else{
                  console.log('ERROR: Could not find wallet')
                }
                        
                        
              }else{
                  console.log(`ERROR: Missing parameters`)
                  
              }
          })

        program
          .command('list')
          .description('Generates a signature of selected data')
          .action(async ()=>{
            
            let walletNames = []
            let dir = './wallets';
            let files = fs.readdirSync(dir);
            for(var i in files){
              
              if (!files.hasOwnProperty(i)) continue;
              var name = dir+'/'+files[i];
              if (!fs.statSync(name).isDirectory()){
                if(files[i] != '.gitignore'){
                  walletNames.push(name);
                }
                  
              }
            }
            
            walletNames.forEach( async (name)=>{
              let wallet = await walletManager.loadWallet(name);
              if(wallet){
                console.log(wallet);
              }else{
                console.log({error:`wallet ${walletName} not found`})
              }
            })

          })

      
      program.parse(process.argv)
}

runWalletCLI();






