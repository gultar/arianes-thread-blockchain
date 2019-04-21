
/////////////////////Blockchain///////////////////////
const sha256 = require('../tools/sha256');
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
  }

  createGenesisBlock(){
    //Initial Nonce Challenge is 100 000
    let genesisBlock = new Block(1554987342039, ["Genesis block"], "Infinity");
    genesisBlock.challenge = 10000000;
    genesisBlock.endMineTime = Date.now();
    genesisBlock.transactions.push(
      //Setup initial coin distribution
      new Transaction( //Blockchain node
        'coinbase', "AoXgtIsWAAC56EKd2LXtNc5NaR1Eu5Jt8FM5J7EJXzLc", 1000, 'ICO transactions'
      ),
      new Transaction( //first node
        'coinbase',"A0LCplPB/lJ6uCBpvUzMAYZIfhcZeFVWk+ycexlA6AH2", 1000, 'ICO transactions'
      ),
      new Transaction( //second node
        'coinbase', "A1ro4i/2GALdz9UjyycVNTveAkutttMLClFjCv6P+hEI", 1000, 'ICO transactions'
      ),
      new Transaction( //third node
        'coinbase', "A0LwcQG6XUkGikwn0aJ/jvv7irysO+z1MWaEh25ci4O/", 1000, 'ICO transactions'
      )

    );

    genesisBlock.calculateHash();

    return genesisBlock;
  }

  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }

  /*Deprecated*/
  addBlock(newBlock){
    newBlock.previousHash = this.getLatestBlock().hash;
    //newBlock.mine(this.difficulty); //Proof of work in action
    this.chain.push(newBlock);
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
        Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions)
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
  async minePendingTransactions(ip, miningRewardAddress, callback){
    let ipAddress = ip


    let miningSuccessful = false;
    let isMining = this.hasEnoughTransactionsToMine()

    if(isMining && process.env.END_MINING !== true){

      logger('Mining next block...');
      logger('Number of pending transactions:', Object.keys(Mempool.pendingTransactions).length);

      let transactionsToMine = Mempool.gatherTransactionsForBlock();
      Mempool.deleteTransactionsFromMinedBlock(transactionsToMine);
      
      let block = new Block(Date.now(), transactionsToMine);
      logger('Transactions about to be mined:', Object.keys(transactionsToMine).length)
      logger('Difference between variable and block transactions?', Object.keys(block.transactions).length)
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
            var miningReward = new Transaction('coinbase', miningRewardAddress, this.miningReward, 'coinbase')
            Mempool.addTransaction(miningReward);
           
            callback(miningSuccessful, block.hash);
          }else{
            Mempool.putbackPendingTransactions(block);
            logger('Block is not valid');
            callback(false, false)
          }
        }else{
          logger('Mining aborted. Peer has mined a new block');
          Mempool.putbackPendingTransactions(block);
          callback(false, false)
        }
      });



    }else{

      callback(false, isMining);
    }

  }


  createTransaction(transaction){
    return new Promise((resolve, reject)=>{
      try{
        this.validateTransaction(transaction)
        .then(valid =>{
          resolve(valid)
        })
      }catch(e){
        console.log(e)
        reject(e)
      }
      
    })
    
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
          // logger(block);
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

  getBalanceFromBlockIndex(index, token){
    var address = token.id;

    logger('INDEX:', index);
    for(var i=0; i < index; i++){
      for(var transHash of Object.keys(this.chain[i].transactions)){
        trans = this.chain[i].transactions[transHash]


          if(trans.fromAddress == address){

            balance = balance - trans.amount;
          }

          if(trans.toAddress == address){

            balance = balance + trans.amount;
          }


      }
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
    - No double spend took place in block
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
          console.log('New block received has been orphaned since latest block has been mined before')
          return false;
        }

        logger('Current mined block is not linked with previous block. Sending it to orphanedBlocks');
        return this.getIndexOfBlockHash(block.previousHash);

      }else{
        // if(block.difficulty = )
        /*
          validate difficulty level
        */
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
          merkleRoot:block.merkleRoot
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


  /***
   * Deprecated
   * 
   */
  getBlocksFromHash(hash){
  	var blocks = [];
  	var index = this.getIndexOfBlockHash(hash);
    var latestBlock = this.getLatestBlock();
    /*
       Only sends block(s) if the hash sent is not the same as the current
       latest block on the chain, thus avoiding too much useless exchange
    */
      if(index > -1){

          for(var i=index+1; i < this.chain.length; i++){
            blocks.push(this.chain[i]);
          }
          return blocks;
      }else if(index == false){
    		logger('ERROR: Hash not found');
        return false;
    	}
  }


  isMiningRewardTransaction(transaction){
    for(var i=this.chain.length-1; i >= 0; i--){
      var block = this.chain[i];
      if(block.minedBy === transaction.toAddress && block.transactions[transaction.hash]){
        return true;
      }else{
        return false;
      }

    }
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
  
          var isChecksumValid = this.validateChecksum(transaction);
          // logger("Is transaction hash valid? :", isChecksumValid);
  
          let isSignatureValid = await this.validateSignature(transaction)
           // logger('Is valid signature? :',isSignatureValid)
           
          var isMiningReward = this.isMiningRewardTransaction(transaction);
          // logger('Is mining reward transaction? :', isMiningReward);
  
          var balanceOfSendingAddr = this.getBalanceOfAddress(transaction.fromAddress) + this.checkFundsThroughPendingTransactions(transaction.fromAddress);
          // logger("Balance of sender is : ",balanceOfSendingAddr);
  
            if(!balanceOfSendingAddr && balanceOfSendingAddr !== 0){
                logger('Cannot verify balance of undefined address token');
                resolve(false)
            }
  
            if(balanceOfSendingAddr >= transaction.amount){
              // logger('Transaction validated successfully');
              resolve(true)
            }else if(transaction.type === 'query'){
              //handle blockbase queries
            }else{
              logger('Address '+transaction.fromAddress+' does not have sufficient funds to complete transaction');
              resolve(false)
            }
  
        }catch(err){
          console.log(err);
          reject(err)
        }
  
  
  
  
      }else{
        logger('ERROR: Transaction is undefined');
        resolve(false)
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

  async saveBlockchain(){
    return new Promise(async (resolve, reject)=>{
      try{
        let blockchainFile = JSON.stringify(this, null, 2);
        let success = await writeToFile(blockchainFile, 'blockchain.json');
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
