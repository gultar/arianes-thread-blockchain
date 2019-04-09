
/////////////////////Blockchain///////////////////////
const sha256 = require('./sha256');
const merkle = require('merkle');
const crypto = require('crypto');
const fs = require('fs');
// const { exec } = require('child_process');
const { MINING_RATE, END_MINING } = require('./constants');
const { displayTime } = require('./utils');
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
    this.difficulty = 4;
    this.pendingTransactions = (pendingTransactions? pendingTransactions: {});
    this.miningReward = 50;
    this.nodeTokens = nodeTokens; //Stores all the node addresses of the P2P network
    this.ipAddresses = ipAddresses;
    this.blockSize = 20; //Minimum Number of transactions per block
    this.orphanedBlocks = [];

  }

  createGenesisBlock(){
    //Initial Nonce Challenge is 100 000
    let genesisBlock = new Block("01/01/2018", "Genesis block", "0");
    genesisBlock.challenge = 100000;
    genesisBlock.endMineTime = Date.now();
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

    if(isMining){

      console.log('Mining next block...');
      console.log('Number of pending transactions:', Object.keys(this.pendingTransactions).length);

      let block = new Block(Date.now(), this.pendingTransactions);
      let lastBlock = this.getLatestBlock();
      this.pendingTransactions = {};

      block.blockNumber = this.chain.length;
      block.previousHash = lastBlock.hash;


      block.challenge = setChallenge(lastBlock.challenge, lastBlock.startMineTime, lastBlock.endMineTime)
      console.log('Current Challenge:', block.challenge)
      miningSuccessful = await block.mine(this.difficulty);

      if(miningSuccessful && process.env.END_MINING !== true){
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
          console.log('Block is not valid');
          callback(false, false)
        }
      }else{
        console.log('Mining aborted. Peer has mined a new block');
        callback(false, false)
      }

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
        console.log("ERROR: Can't get balance of undefined publickey")
        return false;
      }
        for(var block of this.chain){
          // console.log(block);
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

    console.log('INDEX:', index);
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
          /*New block received has been orphaned since latest block has been mined before.*/
          return false;
        }

        console.log('Current mined block is not linked with previous block. Sending it to orphanedBlocks');
        return this.getIndexOfBlockHash(block.previousHash);

      }else{
        // if(block.difficulty = )
        /*
          validate difficulty level
        */
        // console.log('New block successfully validated. Will be appended to current blockchain.')
        return true;
      }

    }else if(containsCurrentBlock){
      console.log('Chain already contains that block')
      /*Chain already contains that block*/
      return false;
    }

  }

  /**
    @desc Useful for sync requests
    @param {string} $blockNumber - Index of block
  */

  getBlockHeader(blockNumber){
    if(blockNumber){
      var block = this.chain[blockNumber];

      if(block){
        var transactionHashes = Object.keys(block.transactions);
        var mrootStructure = merkle('sha256').sync(transactionHashes);
        var mroot = mrootStructure.root()
        if(!mroot){
          console.log('no mroot')
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
    		console.log('ERROR: Hash not found');
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
        // console.log("Is transaction hash valid? :", isChecksumValid);

        var isSignatureValid = this.validateSignature(transaction);
        // console.log("Is transaction signature valid? :", isSignatureValid);

        var isMiningReward = this.isMiningRewardTransaction(transaction);
        // console.log('Is mining reward transaction? :', isMiningReward);

        var balanceOfSendingAddr = this.getBalanceOfAddress(transaction.fromAddress) + this.checkFundsThroughPendingTransactions(transaction.fromAddress);
        // console.log("Balance of sender is : ",balanceOfSendingAddr);

          if(!balanceOfSendingAddr && balanceOfSendingAddr !== 0){
              console.log('Cannot verify balance of undefined address token');
              callback(false);
          }

          if(balanceOfSendingAddr >= transaction.amount){
            // console.log('Transaction validated successfully');
            callback(true)
          }else if(transaction.type === 'query'){
            //handle blockbase queries
          }else{
            console.log('Address '+transaction.fromAddress+' does not have sufficient funds to complete transaction');
            callback(false);
          }
      }catch(err){
        console.log(err);
        callback(false);
      }




  	}else{
  		console.log('ERROR: Transaction is undefined');
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
        console.log(err);
        return false;
      }
  }

}


function RecalculateHash(block){

  return sha256(block.previousHash + block.timestamp + merkleRoot(block.transactions) + block.nonce).toString();
}



function merkleRoot(dataSets){

  if(dataSets != undefined){
    var hashes = Object.keys(dataSets);


    let merkleRoot = merkle('sha256').sync(hashes);
    return merkleRoot.root();
  }

}


module.exports = Blockchain;
