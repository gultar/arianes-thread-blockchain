const { parentPort, workerData } = require('worker_threads')
const ECDSA = require('ecdsa-secp256r1');
const { logger, validatePublicKey } = require('../../tools/utils');
const { isValidTransactionJSON } = require('../../tools/jsonvalidator')
const sha256 = require('../../tools/sha256')
const Transaction = require('./transaction')
const chalk = require('chalk')

class ValidationWorker{
    constructor(){
        this.controller = parentPort
        this.balances = workerData.balanceStates
        this.accounts = workerData.accounts
        this.contracts = workerData.contracts
        this.transactionSizeLimit = 10 * 1024
    }

    init(){
        parentPort.on('message', async (message)=>{
            if(message.account){
                let account = message.account
                this.accounts[account.name] = account
            }else if(message.balances){
                this.balances = message.balances
            }else if(message.deleteAccount){
                let name = message.deleteAccount
                delete this.accounts[name]
            }else if(message.validate){
                let transaction = message.validate

            }else if(message.test){
                let start = process.hrtime()
                // let valid = await this.validateSimpleTransaction(message.test)
                let valid = await this.validateTransactionCall(message.test)
                let end = process.hrtime(start)
                logger('Validation:', end[1] / 1000000)
                parentPort.postMessage({ validated:valid })
            }
        })
    }

    getAccount(accountName){
        return this.accounts[accountName]
    }

    getBalance(publicKey){
        let entry = this.balances[publicKey]
        if(!entry) return 0
        else return entry.balance
    }

    getContract(contractName){
        return this.contracts[contractName]
    }

    async validateTransactionCall(transaction){
        return new Promise(async (resolve, reject)=>{
          if(transaction){
            try{
    
                let fromAccount = await this.getAccount(transaction.fromAddress)
                if(!fromAccount) resolve({error:`REJECTED: Sending account ${transaction.fromAddress} is unknown`});
                else{
    
                  let isSignatureValid = await this.validateActionSignature(transaction, fromAccount.ownerKey)
                  if(!isSignatureValid) resolve({error:'REJECTED: Transaction signature is invalid'});
    
                  let toAccount = await this.getAccount(transaction.toAddress) //Check if is contract
                  if(!toAccount) resolve({error:`REJECTED: Receiving account ${transaction.toAddress} is unknown`});

                  let toAccountIsContract = this.getContract(transaction.toAddress)//toAccount.type == 'contract'
                  if(!toAccountIsContract) resolve({error: 'REJECTED: Transaction calls must be made to contract accounts'})
    
                  var isChecksumValid = this.validateChecksum(transaction);
                  if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});

                  var amountHigherOrEqualToZero = transaction.amount >= 0;
                  if(!amountHigherOrEqualToZero) resolve({error:'REJECTED: Amount needs to be higher than or equal to zero'});

                  let hasMiningFee = transaction.miningFee >= this.calculateTransactionMiningFee(transaction); //check size and fee 
                  if(!hasMiningFee) resolve({error:"REJECTED: Mining fee is insufficient"});

                  var transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
                  if(!transactionSizeIsNotTooBig) resolve({error:'REJECTED: Transaction size is above 10KB'});

                  let isNotCircular = fromAccount.name !== toAccount.name
                  if(!isNotCircular) resolve({error:"REJECTED: Sending account can't be the same as receiving account"});

                  var balanceOfSendingAddr = await this.getBalance(fromAccount.ownerKey) //+ this.checkFundsThroughPendingTransactions(transaction.fromAddress);
                  let hasEnoughFunds = balanceOfSendingAddr >= transaction.amount + transaction.miningFee
                  if(!hasEnoughFunds) resolve({error: 'REJECTED: Sender does not have sufficient funds'})
    
                }
    
                resolve(true)
    
            }catch(err){
              resolve({error:err.message})
            }
      
          }else{
            logger('ERROR: Transaction is undefined');
            resolve({error:'ERROR: Transaction is undefined'})
          }
      
        })
        
    
      }

    validateSimpleTransaction(transaction){
        return new Promise(async (resolve)=>{
          if(isValidTransactionJSON(transaction)){
            
            let fromAddress = transaction.fromAddress;
            let toAddress = transaction.toAddress;
    
            let fromAddressIsAccount = await this.getAccount(fromAddress);
            let toAddressIsAccount = await this.getAccount(toAddress);
    
            if(fromAddressIsAccount){
              fromAddress = fromAddressIsAccount.ownerKey
            }
            if(toAddressIsAccount){
              toAddress = toAddressIsAccount.ownerKey
            }
            
            var isChecksumValid = this.validateChecksum(transaction);
            if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
    
            let isSendingAddressValid = await validatePublicKey(fromAddress)
            let isReceivingAddressValid = await validatePublicKey(toAddress)
    
            if(isSendingAddressValid && isReceivingAddressValid){
    
              let isSignatureValid = await this.validateSignature(transaction, fromAddress);
              if(!isSignatureValid) resolve({error:'REJECTED: Transaction signature is invalid'});
    
              let isNotCircular = fromAddress !== toAddress;
              if(!isNotCircular) resolve({error:"REJECTED: Sending address can't be the same as receiving address"});
    
              var balanceOfSendingAddr = await this.getBalance(fromAddress)
              let hasEnoughFunds = balanceOfSendingAddr >= transaction.amount + transaction.miningFee
              if(!hasEnoughFunds) resolve({error:'REJECTED: Sender does not have sufficient funds'});
              
              var amountIsNotZero = transaction.amount > 0;
              if(!amountIsNotZero) resolve({error:'REJECTED: Amount needs to be higher than zero'});
    
              let hasMiningFee = transaction.miningFee >= this.calculateTransactionMiningFee(transaction); //check size and fee
              if(!hasMiningFee) resolve({error:"REJECTED: Mining fee is insufficient"});
    
              var transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
              if(!transactionSizeIsNotTooBig) resolve({error:'REJECTED: Transaction size is above 10KB'});
    
              resolve(true)
    
            }else if(!isReceivingAddressValid){
    
              resolve({error:'REJECTED: Receiving address is invalid'});
            }else if(!isSendingAddressValid){
              resolve({error:'REJECTED: Sending address is invalid'});
            }
          }else{
            resolve({error:`ERROR: Transaction has an invalid format`})
          }
        })
      }

      async validatePayableReference(reference, transaction, sendingAccount, fromContract){

        // let isValidTransaction = await this.validateTransactionCall(reference);
        // let isValidAction = await this.validateAction(reference)
    
        // if(isValidTransaction.error && isValidAction.error) return { error:'ERROR: Reference is not a valid transaction call or action' }
    
        let fromAccount = await this.getAccount(reference.fromAddress)
        if(!fromAccount || fromAccount.error) return { error:`ERROR: Could not find account ${reference.fromAddress} of payable reference` }
    
        let isSameAddress = fromAccount.name === sendingAccount.name && fromAccount.ownerKey === sendingAccount.ownerKey
        if(!isSameAddress) return { error:'ERROR: Payables must be sent by the same account who sent the reference' }
    
        let isSignatureValid = await this.validateActionSignature(reference, fromAccount.ownerKey)
        if(!isSignatureValid) return { error:'ERROR: Payable reference signature is not valid' }
    
        let referenceContract = await this.getContract(reference.toAddress)
        if(!referenceContract || referenceContract.error) return { error:'ERROR: Payable reference must be made to contract account' }
    
        let isSameContract = reference.toAddress === transaction.fromContract
        if(!isSameContract) return { error:'ERROR: Payable reference must be sent to same contract as payable' }
    
        return true
    
        
      }

    /**
        Checks the validity of the action signature
        @param {object} $action - Action to be inspected
        @param {object} $ownerKey - Public key of the owner account
        @return {boolean} Signature is valid or not
    */
    async validateActionSignature(action, ownerKey){
        try{
            if(action && ownerKey){
                if(validatePublicKey(ownerKey)){
                    const publicKey = await ECDSA.fromCompressedPublicKey(ownerKey);
                    if(publicKey){
                        const verified = await publicKey.verify(action.hash, action.signature)
                        return verified
                    }else{
                        return false
                    }
                
                }else{
                    return false
                }
            }else{
                return false
            }
        }catch(e){
            logger(chalk.red('SIGNATURE VALIDATION ERROR'), e)
            return false
        }
    }

    /**
        Checks the validity of the transaction signature
        @param {object} $transaction - Transaction to be inspected
        @param {object} $fromAddress - Public key of the owner account
        @return {boolean} Signature is valid or not
    */
    async validateSignature(transaction, fromAddress){
        try{
            if(transaction && fromAddress){
                if(validatePublicKey(fromAddress)){
                    const publicKey = await ECDSA.fromCompressedPublicKey(fromAddress);
                    if(publicKey){
                        const verified = await publicKey.verify(transaction.hash, transaction.signature)
                        return verified
                    }else{
                        return false
                    }
                
                }else{
                    return false
                }
            }else{
                return false
            }
        }catch(e){
            logger(chalk.red('SIGNATURE VALIDATION ERROR'), e)
            return false
        }
    }

    /**
        Sets the transaction's mining fee based on file size
        @param {object} $transaction - Transaction to be inspected
        @return {number} Amount to be payed upon mining
    */
    calculateTransactionMiningFee(transaction){
        let transactionBeforeSignature = {
        fromAddress:transaction.fromAddress,
        toAddress:transaction.toAddress,
        type:transaction.type,
        data:transaction.data,
        timestamp:transaction.timestamp
        }

        let size = Transaction.getTransactionSize(transactionBeforeSignature);
        
        let sizeFee = size * 0.0001;
        return sizeFee;
    }


    /**
        Determine whether a coinbase transaction is linked to a block
        @param {object} $transaction - Transaction to be inspected
        @return {object} Block to which the coinbase transaction is linked
    */
    coinbaseTxIsAttachedToBlock(transaction, block){
        return block.coinbaseTransactionHash === transaction.hash
    }

      /**
        Checks if the action hash matches its content
        @param {object} $action - Action to be inspected
        @return {boolean} Checksum is valid or not
    */
    validateActionChecksum(action){
        if(action){
            if(sha256(
                        action.fromAccount + 
                        action.type + 
                        action.task + 
                        action.data + 
                        action.fee + 
                        action.timestamp
                        ) == action.hash){
                return true
            }else{
                return false;
            }
        }
    }

      /**
        Checks if the transaction hash matches it content
        @param {object} $transaction - Transaction to be inspected
        @return {boolean} Checksum is valid or not
    */
    validateChecksum(transaction){
        if(transaction){
            if(sha256(
                        transaction.fromAddress+ 
                        transaction.toAddress+ 
                        (transaction.amount == 0 ? '0' : transaction.amount.toString())+ 
                        (typeof transaction.data == 'string' ? transaction.data : JSON.stringify(transaction.data))+ 
                        transaction.timestamp.toString()+
                        transaction.nonce.toString()
                        ) === transaction.hash){
                return true;
            }else{
                return false
            }
        }
        return false;
    }
}


const runValidator = () =>{
    let validator = new ValidationWorker()
    validator.init()

    console.log('Worker:',validator)
}

runValidator()