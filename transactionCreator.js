#!/usr/bin/env node

const WalletConnector = require('./backend/classes/walletConnector');
const Transaction = require('./backend/classes/transaction')
const sha1 = require('sha1')
let inquirer = require('inquirer');
const program = require('commander')
const axios = require('axios');
const { readFile, createTargetFile } = require('./backend/tools/utils');
const fs = require('fs')


const transactionCreator = (address)=>{
     
    try{
        return new Promise(async (resolve, reject)=>{

        if(address){
            let transactionQ = [{
                type: 'input', name: 'walletName', message: "Enter wallet name:" 
            },{
                type: 'password', name: 'password', message: 'Enter enter wallet password', mask: '*',
            },{
                type: 'input', name: 'sender', message: "Enter sender's public key:"
            },{
                type: 'input', name: 'receiver', message: "Enter receiver's public key:"
            },{
                type: 'number', name: 'amount', message: "Enter the transaction amount:"
            },{
                type: 'input', name: 'data', message: "Enter additional data:"
            }]
        
        
            inquirer.prompt(transactionQ)
              .then(async (answers) => {
                
                  if(answers){
    
                    let walletName = answers.walletName;
                    let password = answers.password;
                    let transaction = new Transaction(answers.sender, answers.receiver, answers.amount, answers.data)
    
                    let filename = `./wallets/${walletName}-${sha1(walletName)}.json`
    
                    WalletConnector.loadWallet(filename)
                    .then(async(wallet)=>{
                        if(wallet){
                            let unlocked = await wallet.unlock(password);
                            if(unlocked){
                                let signature = await wallet.sign(transaction.hash)
                                if(signature){
                                    transaction.signature = signature;
                                    axios.post(address+'/transaction', transaction)
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
                            console.log(`ERROR: Wallet ${credentials.walletName} not found`)
                            resolve(false)
                        }
                    })
    
                    
    
                  }else{
                      console.log('ERROR: No answers provided')
                  }
        
              })
              
        }else{
            console.log('Need to provide target address')
        }
          
          
          
      })
          
          

      }catch(e){
          console.log(e);
      }
    

}


module.exports = transactionCreator;
