const { isValidTransactionCallJSON, isValidTransactionJSON } = require('../../tools/jsonvalidator')
const { logger } = require('../../tools/utils')
const chalk = require('chalk')
const transactionHandler = async ({ transaction, transactionValidation, verbose, apiLog, addTransaction }) =>{
    if(isValidTransactionJSON(transaction) || isValidTransactionCallJSON(transaction)){
  
        let isValid = await transactionValidation(transaction)
        if(!isValid.error){
            let added = await addTransaction(transaction);
            apiLog('<-'+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(verbose) logger(chalk.green('<-')+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
        }else{
            apiLog('!!!'+' Received invalid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(verbose) logger(chalk.red('!!!'+' Received invalid transaction : ')+ transaction.hash.substr(0, 15)+"...")
            logger(valid.error)
        }
        

    }
}

const actionHandler = async ({ action, actionValidation, verbose, apiLog, addAction })=>{
    if(isValidActionJSON(action)){
  
        let isValid = await actionValidation(transaction)
        if(!isValid.error){
            let added = await addAction(transaction);
            apiLog('<-'+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(verbose) logger(chalk.green('<-')+' Received valid transaction : '+ transaction.hash.substr(0, 15)+"...")
        }else{
            apiLog('!!!'+' Received invalid transaction : '+ transaction.hash.substr(0, 15)+"...")
            if(verbose) logger(chalk.red('!!!'+' Received invalid transaction : ')+ transaction.hash.substr(0, 15)+"...")
            logger(valid.error)
        }
        

    }
  }

module.exports = { transactionHandler, actionHandler }