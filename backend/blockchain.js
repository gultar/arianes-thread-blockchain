
/////////////////////Blockchain///////////////////////
const sha256 = require('./sha256');
const merkle = require('merkle');
const crypto = require('crypto');
const fs = require('fs');
// const { exec } = require('child_process');
const { MINING_RATE, END_MINING } = require('./globals');
const { displayTime, logger } = require('./utils');
const Transaction = require('./transaction');
const Block = require('./block');
const setChallenge = require('./challenge');
const chalk = require('chalk');

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

  constructor(chain=false, pendingTransactions=false, nodeTokens={}, ipAddresses=[], publicKeys=[]){
    this.chain = (chain? chain: [this.createGenesisBlock()]);
    this.difficulty = 5;
    this.pendingTransactions = (pendingTransactions? pendingTransactions: {});
    this.miningReward = 50;
    this.nodeTokens = nodeTokens; //Stores all the node addresses of the P2P network
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
      new Transaction(
        'coinbase', 
        `-----BEGIN PUBLIC KEY-----
        MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQD1aWbGj2PamizgVSfE2kmp8uzv
        77yW1W/EiyClkPQfsO2Wdf0ipujSZ1yhMX6iBCnkExNFGe0Cg0NDTAK+vdtT7FIH
        oMrbL/HnhTeBWXmG4kUDrjlyVxnB2eNWkgIzlz0xStfynNu6N3zJ0r+TRLYZETd2
        R1WcAs7xApwiuQjamQIDAQAB
        -----END PUBLIC KEY-----
        `, 1000, 'ICO transactions'
      ),
      new Transaction(
        'coinbase', 
        `-----BEGIN PUBLIC KEY-----
        MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDPhE227fWNoGvKSrddYwBZ+yN5
        +spokmlido3STmhBeAJa8aMGS/daz3Vr2xuSmRUNRhUn6B7Mp54UMH553SqA7agB
        d7hlllCVFKwXklpFfansRpVJYbJOVvxTRn1VpleSpOqa6mn1BHYARwVaUd4Tbqs2
        3bHNyiJLBWmsrnZqFQIDAQAB
        -----END PUBLIC KEY-----
        `, 1000, 'ICO transactions'
      ),
      new Transaction(
        'coinbase', 
        `-----BEGIN PUBLIC KEY-----
        MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEqqReZ40WEZ9p7QZJ4Kkt0pUC
        cIsbrADQyGCi4g+7oQJE84Han/DSWd9YvIa3stJkmOhqTPU4c47+4ug66LZ9L6Sj
        Sg5JtvfLbDAs+eKTD6pcS71VS/Zs+FFkhKFO5vmzHW/hacfJZnC6s6/SV6uIeyzA
        5Yj+2K+A22EY3LIWAwIDAQAB
        -----END PUBLIC KEY-----        
        `, 1000, 'ICO transactions'
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

      var blockStatus;
      var pending = this.pendingTransactions;
      if(newBlock.transactions != undefined){
        var newTransactHashes = Object.keys(newBlock.transactions);
      }else{
        return false
      }


      blockStatus = this.validateBlock(newBlock);

      if(blockStatus === true){
        for(var hash of newTransactHashes){
          delete pending[hash];
        }
        this.chain.push(newBlock);
        this.pendingTransactions = pending;
        return true;
      }else if(blockStatus > 0){
        return blockStatus;
      }else if(blockStatus === false){
        return false;
      }else{
        return false;
      }

  }

  hasEnoughTransactionsToMine(){
    if(Object.keys(this.pendingTransactions).length >= this.blockSize){
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
      this.pendingTransactions[txHash] = block.transactions[txHash];
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
      logger('Number of pending transactions:', Object.keys(this.pendingTransactions).length);

      let block = new Block(Date.now(), this.pendingTransactions);
      let lastBlock = this.getLatestBlock();
      this.pendingTransactions = {};

      block.blockNumber = this.chain.length;
      block.previousHash = lastBlock.hash;


      block.challenge = setChallenge(lastBlock.challenge, lastBlock.startMineTime, lastBlock.endMineTime)
      logger('Current Challenge:', block.challenge)
      block.mine(this.difficulty, (miningSuccessful)=>{
        if(miningSuccessful){
          if(this.validateBlock(block)){
  
            block.minedBy = ipAddress;
            this.chain.push(block);
            console.log(chalk.cyan('\n********************************************************************'))
            console.log(chalk.cyan('* Block number ')+block.blockNumber+chalk.cyan(' mined with hash : ')+ block.hash.substr(0, 25)+"...")
            console.log(chalk.cyan("* Block successfully mined by ")+block.minedBy+chalk.cyan(" at ")+displayTime()+"!");
            console.log(chalk.cyan("* Challenge : "), block.challenge);
            console.log(chalk.cyan("* Block time : "), (block.endMineTime - block.startMineTime)/1000)
            console.log(chalk.cyan('********************************************************************\n'))
            var miningReward = new Transaction(null, miningRewardAddress, this.miningReward, "", Date.now(), false, 'coinbase')
            this.pendingTransactions[miningReward.hash] = miningReward;
  
            callback(miningSuccessful, block.hash);
          }else{
            this.putbackPendingTransactions(block);
            logger('Block is not valid');
            callback(false, false)
          }
        }else{
          logger('Mining aborted. Peer has mined a new block');
          this.putbackPendingTransactions(block);
          callback(false, false)
        }
      });



    }else{

      callback(false, isMining);
    }

  }


  createTransaction(transaction){
    this.validateTransaction(transaction, (valid)=>{
        this.pendingTransactions[transaction.hash] = transaction;
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

      for(var transHash of Object.keys(this.pendingTransactions)){
        trans = this.pendingTransactions[transHash];
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
        var transactionHashes = Object.keys(block.transactions);
        var mrootStructure = merkle('sha256').sync(transactionHashes);
        var mroot = mrootStructure.root()
        if(!mroot){
          logger('no mroot')
          return false;
        }
        var header = {
          blockNumber:block.blockNumber,
          timestamp:block.timestamp,
          previousHash:block.previousHash,
          hash:block.hash,
          nonce:block.nonce,
          merkleRoot:mroot
        }

        return header
      }

    }

  }

  validateBlockHeader(header){
    if(header){
      if(header.hash == sha256(header.previousHash + header.timestamp + header.merkleRoot + header.nonce)){
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
  validateTransaction(transaction, callback){

    if(transaction){

      try{


        var isChecksumValid = this.validateChecksum(transaction);
        // logger("Is transaction hash valid? :", isChecksumValid);

        var isSignatureValid = this.validateSignature(transaction);
        // logger("Is transaction signature valid? :", isSignatureValid);

        var isMiningReward = this.isMiningRewardTransaction(transaction);
        // logger('Is mining reward transaction? :', isMiningReward);

        var balanceOfSendingAddr = this.getBalanceOfAddress(transaction.fromAddress) + this.checkFundsThroughPendingTransactions(transaction.fromAddress);
        // logger("Balance of sender is : ",balanceOfSendingAddr);

          if(!balanceOfSendingAddr && balanceOfSendingAddr !== 0){
              logger('Cannot verify balance of undefined address token');
              callback(false);
          }

          if(balanceOfSendingAddr >= transaction.amount){
            // logger('Transaction validated successfully');
            callback(true)
          }else if(transaction.type === 'query'){
            //handle blockbase queries
          }else{
            logger('Address '+transaction.fromAddress+' does not have sufficient funds to complete transaction');
            callback(false);
          }
      }catch(err){
        logger(err);
        callback(false);
      }




  	}else{
  		logger('ERROR: Transaction is undefined');
  		callback(false)
  	}


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
  /**
    Necessary to allow transaction to be added in pool
  */
  validateSignature(transaction){
      try{

        var verify = crypto.createVerify('RSA-SHA256');
        verify.update(transaction.hash);
        return verify.verify(transaction.fromAddress, transaction.signature, 'hex');

      }catch(err){
        logger(err);
        return false;
      }
  }

}


function RecalculateHash(block){

  return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce).toString();
}



function merkleRoot(dataSets){

  if(dataSets != undefined){
    var hashes = Object.keys(dataSets);


    let merkleRoot = merkle('sha256').sync(hashes);
    return merkleRoot.root();
  }

}


module.exports = Blockchain;
