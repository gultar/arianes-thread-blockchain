
/////////////////////Blockchain///////////////////////
const sha256 = require('../tools/sha256');
const { initBlockchain } = require('../tools/blockchainHandler')
const merkle = require('merkle');
const crypto = require('crypto');
const fs = require('fs');
// const { exec } = require('child_process');
const { MINING_RATE, END_MINING } = require('./globals');
const { 
  displayTime, 
  logger, 
  RecalculateHash, 
  merkleRoot, 
  readFile, 
  writeToFile } = require('../tools/utils');
const Transaction = require('./transaction');
const Block = require('./block');
const setChallenge = require('./challenge');
const chalk = require('chalk');
const ECDSA = require('ecdsa-secp256r1');
const Mempool = require('./mempool')

/**
  * @desc Basic blockchain class.
  * @param {number} $difficulty - block mining difficulty;
  * @param {object} $pendingTransactions - Transaction pool;
  * @param {number} $miningReward - Reward for mining a block;
  * @param {object} $nodeToken - To be removed;
  * @param {array} $ipAddresses - Seed addresses hard coded to bootstrap network;
  * @param {number} $blocksize - minimum number of transactions per block;
*/
class Blockchain{

  constructor(chain=false, pendingTransactions=false, ipAddresses=[], publicKeys=[], nodeID=''){
    this.chain = (chain? chain: [this.createGenesisBlock()]);
    this.sideChain = [];
    this.difficulty = 5;
    this.miningReward = 50;
    this.ipAddresses = ipAddresses;
    this.blockSize = 20; //Minimum Number of transactions per block
    this.orphanedBlocks = [];
    this.transactionSizeLimit = 100 * 1024;
  }

  createGenesisBlock(){
    //Initial Nonce Challenge is 10 000 000
    let genesisBlock = new Block(1554987342039, ["Genesis block"], "Infinity");
    genesisBlock.challenge = 10 * 1000 * 1000; //average 150 000 nonce/sec
    genesisBlock.endMineTime = Date.now();
    genesisBlock.transactions.push(
      //Setup initial coin distribution
      new Transaction( //Blockchain node
        'coinbase', "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG", 10000, 'ICO transactions'
      ),
      new Transaction( //first node
        'coinbase',"AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6", 10000, 'ICO transactions'
      ),
      new Transaction( //second node
        'coinbase', "A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R", 10000, 'ICO transactions'
      ),
      new Transaction( //third node
        'coinbase', "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr", 10000, 'ICO transactions'
      )

    );

    genesisBlock.calculateHash();

    return genesisBlock;
  }

  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }
  
  /**
    Adds block only if valid
    Will return true if the block is valid, false if not
    or the index of the block to which it is linked if valid but out of sync
    @param {object} $newBlock - New block to be added
  */
  syncBlock(newBlock){
      if(newBlock && newBlock.transactions){
        var blockStatus;

      blockStatus = this.validateBlock(newBlock);

      if(blockStatus === true){
        
        this.chain.push(newBlock);
        return true;
      }else if(blockStatus > 0){
        return blockStatus;
      }else if(blockStatus === false){
        return false;
      }else{
        return false;
      }s
      }else{
        return false;
      }
  }

  hasEnoughTransactionsToMine(){
    if(Object.keys(Mempool.pendingTransactions).length >= this.blockSize){
      return true
    }else{
      return false;
    }
  }

  /**
    In case of block rollback, add back all the transactions contained in the block
    @param {object} $block - Block to deconstruct
  */
  putbackPendingTransactions(block){
    for(var txHash in Object.keys(block.transactions)){
      Mempool.pendingTransactions[txHash] = block.transactions[txHash];
      delete block.transactions[txHash];
    }
  }
  /**
    Gathers all transactions in transaction pool and attempts to mine a block
    If a peer mines block before reaching the correct hash, the mining operation
    is cancelled and the peer's hash will be validated then the block will be fetched
    and added to the chain
    @param {string} $ip - IP of mining node
    @param {string} $miningRewardAddress - Public key of mining node
    @param {function} $callback - Sends result of mining operation
  */
  async minePendingTransactions(ip, block , miningRewardAddress, callback){
    let ipAddress = ip
    
    //Useless???
    let miningSuccessful = false;
    let isMining = this.hasEnoughTransactionsToMine();
      
      let lastBlock = this.getLatestBlock();
      block.blockNumber = this.chain.length;
      block.previousHash = lastBlock.hash;
      block.challenge = setChallenge(lastBlock.challenge, lastBlock.startMineTime, lastBlock.endMineTime)
      
      logger('Current Challenge:', block.challenge)
      

      block.mine(this.difficulty, (miningSuccessful)=>{
        if(miningSuccessful && process.env.END_MINING !== true){
          if(this.validateBlock(block)){

            
            
            block.minedBy = ipAddress;
            this.chain.push(block);
            
            console.log(chalk.cyan('\n********************************************************************'))
            console.log(chalk.cyan('* Block number ')+block.blockNumber+chalk.cyan(' mined with hash : ')+ block.hash.substr(0, 25)+"...")
            console.log(chalk.cyan("* Block successfully mined by ")+block.minedBy+chalk.cyan(" at ")+displayTime()+"!");
            console.log(chalk.cyan("* Challenge : "), block.challenge);
            console.log(chalk.cyan("* Block time : "), (block.endMineTime - block.startMineTime)/1000)
            console.log(chalk.cyan("* Nonce : "), block.nonce)
            console.log(chalk.cyan('* Number of transactions in block:'), Object.keys(block.transactions).length)
            console.log(chalk.cyan('********************************************************************\n'))
            
            
            // var miningReward = new Transaction('coinbase', miningRewardAddress, this.miningReward, 'coinbase')
            // Mempool.addTransaction(miningReward);

            callback(miningSuccessful, block.hash);

          }else{
            logger('Block is not valid');
            callback(false, false)
          }
        }else{
          logger('Mining aborted. Peer has mined a new block');
          callback(false, false)
        }
      });

  }


  createTransaction(transaction){
    return new Promise((resolve, reject)=>{
      this.validateTransaction(transaction)
      .then(valid =>{
        resolve(valid)
      })
      .catch(e =>{
        reject(e);
      })
      
    })
    
  }

  createCoinbaseTransaction(publicKey, blockHash){
    
    return new Promise((resolve, reject)=>{
      if(publicKey){
        try{
          var miningReward = new Transaction('coinbase', publicKey, this.miningReward, blockHash)
          
          Mempool.addCoinbaseTransaction(miningReward);
          logger(chalk.blue('$$')+' Created coinbase transaction: '+ miningReward.hash.substr(0, 15))
          resolve(miningReward)

        }catch(e){
          console.log(e);
          resolve(false);
        }
      }else{
        logger('ERROR: Could not create coinbase transaction. Missing public key');
        resolve(false);
      }
      
    })
  }


  checkIfChainHasHash(hash){
    for(var i=this.chain.length; i > 0; i--){
      if(this.chain[i-i].hash === hash){
        return true
      }
    }

    return false;
  }

  getIndexOfBlockHash(hash){
    for(var i=0; i < this.chain.length; i++){
      if(this.chain[i].hash === hash){
        return i;
      }
    }

    return false;
  }

  isBlockIsLinked(previousHash){
    var lastBlock = this.getLatestBlock();
    if(lastBlock.hash === previousHash){
      return true;
    }
    return false;
  }

  /**
    Follows the account balance of a given wallet through all blocks
    @param {string} $publicKey - Public key involved in transaction, either as sender or receiver
  */
  getBalanceOfAddress(publicKey){
    if(publicKey){
      var address = publicKey;
      let balance = 0;
      var trans;
      if(!publicKey){
        logger("ERROR: Can't get balance of undefined publickey")
        return false;
      }
        for(var block of this.chain){
          
          for(var transHash of Object.keys(block.transactions)){
            
            trans = block.transactions[transHash]
            if(trans){
              if(trans.fromAddress == address){

                balance = balance - trans.amount;
              }

              if(trans.toAddress == address){

                balance = balance + trans.amount;
              }

            }


          }
        }

      return balance;
    }

  }

    /**
    Follows the account balance of a given wallet through current unvalidated transactions
    @param {string} $publicKey - Public key involved in transaction, either as sender or receiver
  */
  checkFundsThroughPendingTransactions(publicKey){
    var balance = 0;
    var trans;

    if(publicKey){
      var address = publicKey;

      for(var transHash of Object.keys(Mempool.pendingTransactions)){
        trans = Mempool.pendingTransactions[transHash];
        if(trans){

          if(trans.fromAddress == address){
            balance = balance - trans.amount;
          }

          if(trans.toAddress == address){
            balance = balance + trans.amount;
          }

        }else{
          return 0;
        }

      }

      return balance;
    }else{
      return false;
    }

  }

  getTransactionHistory(publicKey){
    if(publicKey){
      var address = publicKey;
      var history = {
        sent:{},
        received:{},
        pending:{
          sent:{},
          received:{}
        }
      }
      var trans;
      if(!publicKey){
        logger("ERROR: Can't get balance of undefined publickey")
        return false;
      }
        for(var block of this.chain){
          // logger(block);
          for(var transHash of Object.keys(block.transactions)){
            trans = block.transactions[transHash]
            if(trans){
              if(trans.fromAddress == address){
                history.sent[trans.hash] = trans
              }
              if(trans.toAddress == address){
                history.received[trans.hash] = trans;
              }

            }

          }

          for(var transHash of Object.keys(Mempool.pendingTransactions)){
            trans = Mempool.pendingTransactions[transHash];
            if(trans){
    
              if(trans.fromAddress == address){
                history.pending.sent[trans.hash] = trans
              }
    
              if(trans.toAddress == address){
                history.pending.received[trans.hash] = trans;
              }
    
            }
    
          }
        }

      return history;
    }

  }

  getTransactionFromChain(hash){
    let tx = {}
    if(hash){
      this.chain.forEach(block =>{
        if(block.transactions[hash]){
          //need to avoid collision
          tx = block.transactions[hash];
          return tx;
        }
      })
      return false;
    }
  }

  /**
    Shows which block is conflicting
  */
  isChainValid(){
    for(let i=1;i < this.chain.length; i++){

      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if(currentBlock.hash !== RecalculateHash(currentBlock)){
        console.log('*******************************************************************');
        console.log('currentblock hash does not match the recalculation ');
        console.log('Invalid block is :' + i + ' with hash: ' + currentBlock.hash + ' and previous hash: ' + previousBlock.hash);
        console.log('*******************************************************************');
        return false;
      }else if(currentBlock.previousHash !== previousBlock.hash){
        console.log('*******************************************************************');
        console.log('* currentblock hash does not match previousblock hash *');
        console.log('Invalid block is :' + i + ' with hash: ' + currentBlock.hash + ' and previous hash: ' + previousBlock.hash);
        console.log('*******************************************************************');
        return false;
      }
    }

    return true;
  }


  /**
    Criterias for validation are as follows:
    - Block has successfully calculated a valid hash
    - Block linked with previous block by including previous hash in its own hash calculation
    - Block difficulty hasn't been tempered with
    - Chain doesn't already contain this block
    - All transactions are valid
    - No double spend took place in chain
    @param {string} $block - Block to be validated
  */
  validateBlock(block){

    var containsCurrentBlock = this.checkIfChainHasHash(block.hash);
    var isLinked = this.isBlockIsLinked(block.previousHash);
    var latestBlock = this.getLatestBlock();
    //Validate transactions using merkle root
    if(!containsCurrentBlock){
      
      if(!isLinked){

        if(latestBlock.previousHash == block.previousHash){
          /*.*/
          logger('New block received has been orphaned since latest block has been mined before')
          return false;
        }

        logger('Current mined block is not linked with previous block. Sending it to orphanedBlocks');
        return this.getIndexOfBlockHash(block.previousHash);

      }else{
        // if(block.difficulty = )
        /*
          validate difficulty level
        */
        // let block = this.validateBlockTransactions(block);
        // logger('New block successfully validated. Will be appended to current blockchain.')
        return true;
      }

    }else if(containsCurrentBlock){
      logger('Chain already contains that block')
      /*Chain already contains that block*/
      return false;
    }

  }

  /**
    @desc Useful for sync requests
    @param {string} $blockNumber - Index of block
  */

  getBlockHeader(blockNumber){
    if(blockNumber >= 0){

      var block = this.chain[blockNumber];

      if(block){
        
        var header = {
          blockNumber:block.blockNumber,
          timestamp:block.timestamp,
          previousHash:block.previousHash,
          hash:block.hash,
          nonce:block.nonce,
          merkleRoot:block.merkleRoot,
          actionMerkleRoot:block.actionMerkleRoot
        }

        return header
      }

    }

  }

  validateBlockHeader(header){
    if(header){
      
      if(header.hash == RecalculateHash(header)){
        return true;
      }else{
        return false;
      }
    }
  }

  validateBlockTransactions(block){
    return new Promise((resolve, reject)=>{
      if(block){
        let txHashes = Object.keys(block.transactions);
        txHashes.forEach( hash =>{
          let transaction = block.transactions[hash];
          let valid = this.validateTransaction(transaction);
          if(valid.error){
            Mempool.rejectTransactions(hash)
            logger('Rejected Transaction:', hash);
            delete block.transactions[hash];
          }
        })
        resolve(block);
      }else{
        logger('ERROR: Must pass block object')
        resolve(false)
      }
      
    })
  }

  /**
  *  To run a proper transaction validation, one must look back at all the previous transactions that have been made by
  *  emitting peer every time this is checked, to avoid double spending. An initial coin distribution is made once the genesis
  *  block has been made. This needs some work since it is easy to send a false transaction and accumulate credits
  *
  * @param {Object} $transaction - transaction to be validated
  * @param {function} $callback - Sends back the validity of the transaction
  */

  async validateTransaction(transaction){
    return new Promise(async (resolve, reject)=>{
      if(transaction){
        try{
          var isMiningReward = transaction.fromAddress == 'coinbase';

          if(!isMiningReward){

            var isChecksumValid = this.validateChecksum(transaction);
           
            let isSignatureValid = await this.validateSignature(transaction)
           
            var balanceOfSendingAddr = this.getBalanceOfAddress(transaction.fromAddress) + this.checkFundsThroughPendingTransactions(transaction.fromAddress);
           
            var amountIsNotZero = transaction.amount > 0;

            let hasMiningFee = transaction.miningFee > 0; //check size and fee 
            
            var transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
              
            if(!isChecksumValid){
              logger('REJECTED: Transaction checksum is invalid');
              resolve({error:'REJECTED: Transaction checksum is invalid'});
            }
              
            if(!isSignatureValid){
              logger('REJECTED: Transaction signature is invalid');
              resolve({error:'REJECTED: Transaction signature is invalid'});
            }

            if(!amountIsNotZero){
              logger('REJECTED: Amount needs to be higher than zero');
              resolve({error:'REJECTED: Amount needs to be higher than zero'});
            }
              
            if(!transactionSizeIsNotTooBig){
              logger('REJECTED: Transaction size is above 10KB');
              resolve({error:'REJECTED: Transaction size is above 10KB'});  
            }
              
            if(balanceOfSendingAddr < transaction.amount){
              logger('REJECTED: Sender does not have sufficient funds')
              resolve({error:'REJECTED: Sender does not have sufficient funds'});
            }  

          

          }else if(isMiningReward){
            
            let isValidCoinbaseTransaction = await this.validateCoinbaseTransaction(transaction)

            if(isValidCoinbaseTransaction.error){
              resolve({error:isValidCoinbaseTransaction.error})
            }else if(isValidCoinbaseTransaction.pending){
              resolve({pending:isValidCoinbaseTransaction.pending})
            }

          }
          
          resolve(true)
         
              
        }catch(err){
          console.log(err);
          resolve({error:'ERROR: an error occured'})
        }
  
      }else{
        logger('ERROR: Transaction is undefined');
        resolve({error:'ERROR: Transaction is undefined'})
      }
  
    })
    

  }

  async validateCoinbaseTransaction(transaction){
    return new Promise(async (resolve, reject)=>{
      if(transaction){

        try{
  
          let isChecksumValid = this.validateChecksum(transaction);
          let fiveBlocksHavePast = await this.waitFiveBlocks(transaction);
          let isAttachedToMinedBlock = await this.coinbaseTxIsAttachedToBlock(transaction);
          let isAlreadyInChain = await this.getTransactionFromChain(transaction.hash);
          let hasTheRightMiningRewardAmount = transaction.amount == (this.miningReward + transaction.miningFee);
          let transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
                  
          if(!isChecksumValid){
            // logger('REJECTED: Coinbase transaction checksum is invalid');
            resolve({error:'REJECTED: Transaction checksum is invalid'});
          }

          // if(!hasTheRightMiningRewardAmount){
          //   logger('REJECTED: Coinbase transaction does not contain the right mining reward: '+ transaction.amount)
          //   resolve({error:'REJECTED: Coinbase transaction does not contain the right mining reward: '+ transaction.amount});
          // }

          if(isAlreadyInChain){
            // logger('COINBASE TX REJECTED: Already exists in blockchain')
            Mempool.deleteCoinbaseTransaction(transaction)
          }

          if(!isAttachedToMinedBlock){
            // logger('COINBASE TX REJECTED: Is not attached to any mined block');
            resolve({error:'COINBASE TX REJECTED: Is not attached to any mined block'})
          }

          if(fiveBlocksHavePast != true){
            resolve({ pending:'PENDING: Coinbase transaction needs to wait five blocks' })
          }
            
          if(!transactionSizeIsNotTooBig){
            // logger('COINBASE TX REJECTED: Transaction size is above '+this.transactionSizeLimit+'Kb');
            resolve({error:'COINBASE TX REJECTED: Transaction size is above '+this.transactionSizeLimit+'Kb'}); 
          } 
          
          resolve(true)
              
        }catch(err){
          console.log(err);
          resolve({error:'ERROR: an error occured'})
        }
  
      }else{
        logger('ERROR: Coinbase transaction is undefined');
        resolve({error:'ERROR: Coinbase transaction is undefined'})
      }
  
    })
    

  }

  validateAction(action){
    return new Promise((resolve, reject)=>{
      if(action){
        let isChecksumValid = this.validateActionChecksum(action);
        let isSentByOwner = this.validateActionSignature(action);
        let hasMiningFee = action.fee > 0; //check if amount is correct
        let actionIsNotTooBig = Transaction.getTransactionSize(action) < this.transactionSizeLimit;
        if(!isChecksumValid){
          resolve({error:"ERROR: Action checksum is invalid"})
        }
  
        if(!isSentByOwner){
          resolve({error:"ERROR: Signature is not associated with sender account"})
        }
  
        if(!actionIsNotTooBig){
          resolve({error:'ERROR: Action size is above '+this.transactionSizeLimit+'Kb'})
        }
  
        if(!hasMiningFee){
          resolve({error:'ERROR: Action needs to contain mining fee propertional to its size'})
        }
  
        resolve(true);
      }
    })
    
  }

  /**
    Checks if the transaction hash matches it content
    @param {object} $transaction - Transaction to be inspected
    @return {boolean} Checksum is valid or not
  */
  validateChecksum(transaction){
    if(transaction){
       if(sha256(transaction.fromAddress+ transaction.toAddress+ transaction.amount+ transaction.data+ transaction.timestamp) === transaction.hash){
        return true;
      }
    }
    return false;
  }

  validateActionChecksum(action){
    if(action){
      if(sha256(action.fromAccount.publicKey + action.type + action.task + action.data + action.fee + action.timestamp + action.contractRef) == action.hash){
       return true
      }else{
        return false;
      }
    }
  }

  validateSignature(transaction){
    return new Promise((resolve, reject)=>{
      if(transaction){
        
        const publicKey = ECDSA.fromCompressedPublicKey(transaction.fromAddress);
        resolve(publicKey.verify(transaction.hash, transaction.signature))

      }else{
        resolve(false);
      }
    })
  }

  validateActionSignature(action){
    return new Promise((resolve, reject)=>{
      if(action){
        
        const publicKey = ECDSA.fromCompressedPublicKey(action.fromAccount.publicKey);
        resolve(publicKey.verify(action.hash, action.signature))
      }else{
        resolve(false);
      }
    })
  }
  

  coinbaseTxIsAttachedToBlock(transaction){
    let found = false;

    this.chain.forEach( block =>{

      if(block.coinbaseTransactionHash == transaction.hash){
        found = block;
      }
    })
        
    return found
  }

  async waitFiveBlocks(transaction){
    return new Promise((resolve, reject) =>{
      let latestBlock = this.getLatestBlock()
      if(latestBlock && latestBlock.hasOwnProperty('blockNumber')){
        this.chain.forEach( block =>{
          
          if(block.coinbaseTransactionHash == transaction.hash){
            
            let blocksPast = this.chain.length - block.blockNumber;
            if(blocksPast >= 6){
              
              resolve(true)
            }else{
              resolve(false)
            }
            
          }
        })
        
      }else{
        resolve(false)
      }
    })
    
    
  }

  async saveBlockchain(){
    return new Promise(async (resolve, reject)=>{
      try{
        let blockchainFile = JSON.stringify(this, null, 2);
        let success = await writeToFile(blockchainFile, './data/blockchain.json');
        if(success){
          resolve(true)
        }else{
          resolve(false);
        }
      }catch(e){
        reject(e);
      }
      
    })
    
  }

}

module.exports = Blockchain;



