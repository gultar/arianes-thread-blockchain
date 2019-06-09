
/////////////////////Blockchain///////////////////////
const sha256 = require('../tools/sha256');
const { 
  displayTime, 
  logger, 
  RecalculateHash, 
  writeToFile,
  validatePublicKey,
  merkleRoot } = require('../tools/utils');
const { isValidAccountJSON, isValidHeaderJSON, isValidBlockJSON } = require('../tools/jsonvalidator');
const Transaction = require('./transaction');
const Block = require('./block');
const { setChallenge, setDifficulty } = require('./challenge');
const chalk = require('chalk');
const merkle = require('merkle');
const ECDSA = require('ecdsa-secp256r1');
const Mempool = require('./mempool');
const JSONStream = require("JSONStream").stringifyObject("{",",","}")
const fs = require('fs');
let _ = require('private-parts').createKey();

/**
  * @desc Basic blockchain class.
  * @param {number} $difficulty - block mining difficulty;
  * @param {object} $pendingTransactions - Transaction pool;
  * @param {number} $miningReward - Reward for mining a block;
  * @param {number} $blocksize - minimum number of transactions per block;
*/
class Blockchain{

  constructor(chain=false, difficulty=1){
    this.chain = (chain? chain: [this.createGenesisBlock()]);
    this.difficulty = difficulty;
    this.blockFork = []
    this.miningReward = 50;
    this.blockSize = 5; //Minimum Number of transactions per block
    this.maxDepthForUncleBlocks = 3;
    this.transactionSizeLimit = 10 * 1024;
  }

  createGenesisBlock(){
    //Initial Nonce Challenge is 10 000 000
    let genesisBlock = new Block(1554987342039, {
      'first':new Transaction('coinbase', "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG", 10000, 'ICO transactions'),
      'second':new Transaction('coinbase',"AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6", 10000, 'ICO transactions'),
      'third':new Transaction('coinbase', "A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R", 10000, 'ICO transactions'),
      'fourth':new Transaction('coinbase', "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr", 10000, 'ICO transactions'),
    }, {});
    genesisBlock.challenge = 5 * 1000 * 1000//10 * 1000 * 1000; //average 150 000 nonce/sec
    genesisBlock.endMineTime = Date.now();
    genesisBlock.calculateHash();
    genesisBlock.difficulty = 1;
    return genesisBlock;
  }

  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }
  
  // /**
  //   Adds block only if valid
  //   Will return true if the block is valid, false if not
  //   or the index of the block to which it is linked if valid but out of sync
  //   @param {object} $newBlock - New block to be added
  // */
  // async syncBlock(newBlock){
  //     if(isValidBlockJSON(newBlock)){
        
  //     let isValidBlock = await this.validateBlock(newBlock);
  //     if(isValidBlock){
  //       var isLinked = this.isBlockLinked(newBlock);
  //       if(isLinked){
          
  //         logger(chalk.green('* Synced new block ')+newBlock.blockNumber+chalk.green(' with hash : ')+ newBlock.hash.substr(0, 25)+"...");
  //         logger(chalk.green('* Number of transactions: '), Object.keys(newBlock.transactions).length)
  //         logger(chalk.green('* By: '), newBlock.minedBy)
  //         this.chain.push(newBlock);
  //         Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
  //         return true;
  //       }else{
  //         // logger('WARNING: Block is not linked with previous block');
  //         // console.log(this.extractHeader(newBlock))
  //         this.createBlockBranch(newBlock)
  //       }
        
  //     }else{
  //       return false;
  //     }
  //   }else{
  //     return false;
  //   }
  // }

  pushBlock(newBlock, verbose=false){
    return new Promise(async (resolve)=>{
      if(isValidBlockJSON(newBlock)){
        let isValidBlock = await this.validateBlock(newBlock);
        if(isValidBlock){
          var isLinked = this.isBlockLinked(newBlock);
          if(isLinked){
            this.chain.push(newBlock);

            if(verbose){
              logger(chalk.green('* Synced new block ')+newBlock.blockNumber);
              logger(chalk.green('* Block hash : ')+ newBlock.hash.substr(0, 25)+"...");
              logger(chalk.green('* Previous Hash hash : ')+ newBlock.previousHash.substr(0, 25)+"...")
              logger(chalk.green('* Number of transactions: '), Object.keys(newBlock.transactions).length);
              logger(chalk.green('* Number of actions : '), Object.keys(newBlock.actions).length);
              logger(chalk.green('* By: '), newBlock.minedBy)
            }else{
              logger(chalk.green(`[$] New Block ${newBlock.blockNumber} created : ${newBlock.hash.substr(0, 25)}...`));
            }
            
            Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
            resolve(true);
            
          }else{
            let isBlockFork = await this.createBlockBranch(newBlock)
            if(isBlockFork.fork) resolve({fork:isBlockFork.fork});
            if(isBlockFork.resolved) resolve(true);
            if(isBlockFork.error) resolve({error:isBlockFork.error})
            resolve(true)
          }
          
        }else{
          resolve({error:'Invalid block'})
        }
      }else{
        resolve({error:'ERROR: New block undefined'})
      }
    })

  }

  createBlockBranch(newBlock){
    return new Promise(async( resolve)=>{
      if(this.getLatestBlock().hash != newBlock.hash){
        
        let isBlockNewFork = this.getLatestBlock().previousHash == newBlock.previousHash 
        if(isBlockNewFork){
          logger(chalk.yellow(`* Added new block fork ${newBlock.hash.substr(0, 25)}...`));
          logger(chalk.yellow(`* At block number ${newBlock.blockNumber}...`));
          if(this.getLatestBlock().blockFork){
            this.getLatestBlock().blockFork[newBlock.hash] = newBlock;
          }else{
            this.getLatestBlock().blockFork = {}
            this.getLatestBlock().blockFork[newBlock.hash] = newBlock;
          }
          
          resolve(
          {
            fork:{
              blockNumber:newBlock.blockNumber,
              hash:newBlock.hash,
              previousHash:newBlock.previousHash,

            }
          })
        }else{
          //Resolving block fork that built up over several blocks (max four)
          let lastBlock = this.getLatestBlock();
          let secondLastBlock = this.chain[lastBlock.blockNumber - 1];
          let thirdLastBlock = this.chain[lastBlock.blockNumber - 2];
          if(lastBlock.blockFork){
            
            let forkedBlock = this.getLatestBlock().blockFork[newBlock.previousHash];
            if(!forkedBlock) resolve({error:'ERROR: Forked block not found'})
            
            let parallelBranch = this.buildParallelBranch(newBlock);
            
            //Minus one for the newest block which has not been added
            let numOfBlocksToRemove = parallelBranch.length - 1;
            let tailBlock = parallelBranch[0];
              //Is tail block of the parallel branch linked with the previous chain block
              //to be able to merge the branch with the chain
              if(this.chain[tailBlock.blockNumber - 1].hash == tailBlock.previousHash){
                //extract the top part of the second branch which will be orphaned
                let orphanedBranch = this.chain.splice(-1, numOfBlocksToRemove);
                //add blocks of the parallel branch one by one
                parallelBranch.forEach( async (block)=>{
                  let added = await this.pushBlock(block, false)
                  if(added.error) resolve({error:added.error})
                  logger(chalk.yellow(`* Synced block from parallel branch ${chalk.white(block.blockNumber)}`))
                  logger(chalk.yellow(`* Hash: ${chalk.white(block.hash.substr(0, 25))}...`))
                  logger(chalk.yellow(`* Previous Hash: ${chalk.white(block.previousHash.substr(0, 25))}...`))
                })

                logger(chalk.yellow(`* Finished switching branch`))
                logger(chalk.yellow(`Now working on head block ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
                //add all orphaned blocks to current chain as forked blocks
                orphanedBranch.forEach( block=>{
                  if(block){
                    if(block.blockFork) block.blockFork = {}
                    if(this.chain[block.blockNumber]){
                      if(this.chain[block.blockNumber].blockFork){
                        this.chain[block.blockNumber].blockFork[block.hash] = block; 
                      }else{
                        this.chain[block.blockNumber].blockFork = {}
                        this.chain[block.blockNumber].blockFork[block.hash] = block; 
                      }
                    }else{
                      if(this.getLatestBlock().blockFork){
                        this.getLatestBlock().blockFork[block.hash] = block;
                      }else{
                        this.getLatestBlock().blockFork = {};
                        this.getLatestBlock().blockFork[block.hash] = block;
                      }
                      
                    }
                  }
                })
                resolve({resolved:true})
              }else{
                resolve({error:'ERROR: parallel branch is not linked with current chain'})
              }
            
          }else if(secondLastBlock.blockFork){
            
            let forkedBlock = secondLastBlock.blockFork[newBlock.previousHash];
            if(!forkedBlock) resolve({error:'ERROR: Forked block not found'})

            //Raising block fork one block higher
            this.getLatestBlock().blockFork[newBlock.hash] = newBlock;

            resolve(
              {
                fork:{
                  blockNumber:newBlock.blockNumber,
                  hash:newBlock.hash,
                  previousHash:newBlock.previousHash,
                }
            })

          }else if(thirdLastBlock.blockFork){
            
            let forkedBlock = thirdLastBlock.blockFork[newBlock.previousHash];
            if(!forkedBlock) resolve({error:'ERROR: Forked block not found'})
            //Raising block fork one block higher
            this.chain[thirdLastBlock.blockNumber + 1].blockFork[newBlock.hash] = newBlock;

            resolve(
              {
                fork:{
                  blockNumber:newBlock.blockNumber,
                  hash:newBlock.hash,
                  previousHash:newBlock.previousHash,
                }
            })

          }else{
            resolve({error:'ERROR: Could not resolve chain, head block has not been forked'})
          }
        }
        
      }else{
        resolve({error:'ERROR: Cannot create branch with block identical to head block'})
      }
      
    })
  }

  gatherAllForks(){
    let forks = {}
    for(var i=0; i<this.chain.length; i++){
      if(this.chain[i].blockFork){
        let hashes = Object.keys(this.chain[i].blockFork)
        hashes.forEach( hash=>{
          console.log('Hash: ', hash)
          forks[hash] = this.chain[i].blockFork[hash];
        })
        
      }
    }

    return forks
  }

  buildParallelBranch(headBlock){
    let parallelBranch = [];
    let workingBlock = headBlock;
    let previousBlock = {}
    parallelBranch.unshift(workingBlock)
    for(var i=headBlock.blockNumber-1; i>0; i--){
      if(this.chain[i]){
        if(this.chain[i].blockFork){
          previousBlock = this.chain[i].blockFork[workingBlock.previousHash]
          if(previousBlock){
            parallelBranch.unshift(previousBlock);
            workingBlock = previousBlock;
          }
          
        }
      }
      
    }
    

    return parallelBranch;
  }

  findForkInChain(newBlock){
    return new Promise((resolve)=>{
      if(block){
        this.chain.forEach( block=>{
          if(block.hash == newBlock.previousHash){
            resolve({block:block.blockNumber})
          }else if(block.blockFork && block.blockFork.hash == newBlock.previousHash){
            resolve({blockFork:block.blockNumber})
          }
        })

        resolve(false);
      }else{
        resolve(false)
      }
    })
    
  }

  

  compareHeaders(headers){

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

  selectNextPreviousBlock(){
    if(this.getLatestBlock().blockFork){
      let latestBlock = this.getLatestBlock();
      let blockFork = this.getLatestBlock().blockFork;
      if(blockFork.nonce > latestBlock.nonce){
        return blockFork;
      }else{
        return latestBlock;
      }
    }else{
      return this.getLatestBlock();
    }

  }

  async mineNextBlock(block, ipAddress, verbose){
    return new Promise((resolve)=>{
      let lastBlock = this.selectNextPreviousBlock();
      block.blockNumber = this.chain.length;
      block.previousHash = lastBlock.hash;
      block.challenge = setChallenge(lastBlock.challenge, lastBlock.startMineTime, lastBlock.endMineTime)
      block.difficulty = setDifficulty(lastBlock.difficulty, lastBlock.challenge, this.chain.length);
      
      logger('Current Challenge:', block.challenge)
      logger(chalk.cyan('Adjusted difficulty to :', block.difficulty))
      block.mine(block.difficulty)
      .then(async (success)=>{
        
        process.ACTIVE_MINER.kill()
        process.ACTIVE_MINER = false;
        
        if(success){ 
          block = success;
          if(this.validateBlock(block)){

            block.totalChallenge = await this.calculateWorkDone() + block.nonce;
            block.minedBy = ipAddress;
            this.pushBlock(block, false);

            if(!verbose){

              console.log(chalk.cyan('\n********************************************************************'))
              console.log(chalk.cyan('* Block number : ')+block.blockNumber);
              console.log(chalk.cyan('* Block Hash : ')+ block.hash.substr(0, 25)+"...")
              console.log(chalk.cyan('* Previous Hash : ')+ block.previousHash.substr(0, 25)+"...")
              console.log(chalk.cyan("* Block successfully mined by : ")+block.minedBy+chalk.cyan(" at ")+displayTime()+"!");
              console.log(chalk.cyan("* Challenge : "), block.challenge);
              console.log(chalk.cyan("* Block time : "), (block.endMineTime - block.startMineTime)/1000)
              console.log(chalk.cyan("* Nonce : "), block.nonce)
              console.log(chalk.cyan("* Total Challenge : "), block.totalChallenge)
              console.log(chalk.cyan('* Number of transactions in block : '), Object.keys(block.transactions).length)
              console.log(chalk.cyan('********************************************************************\n'))
              
            }else{
              let header = this.extractHeader(block)
              console.log(chalk.cyan(JSON.stringify(header, null, 2)))
            }
            
            resolve(success);

          }else{
            // logger('Block is not valid');
            resolve(false)
            
          }
        }else{
          // logger('Mining aborted. Peer has mined a new block');
          resolve(false)
        }

        

      })
    })
    

  }

  calculateWorkDone(chain=this.chain){
    let total = 0;
    chain.forEach( block=>{
      total += block.nonce;
    })

    return total;
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

  isBlockLinked(block){
    if(block){
      var lastBlock = this.getLatestBlock();
      if(lastBlock.hash === block.previousHash){
        return true;
      }
      return false;
    }
    
  }

  getBlockFromHash(hash){
    for(var i=0; i < this.chain.length; i++){
      if(this.chain[i].hash === hash){
        return this.chain[i];
      }
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
      var action;
      if(!publicKey){
        logger("ERROR: Can't get balance of undefined publickey")
        return false;
      }
        for(var block of this.chain){
          
          for(var transHash of Object.keys(block.transactions)){
            
            trans = block.transactions[transHash]
            if(trans){
              if(trans.fromAddress == address){

                balance = balance - trans.amount - trans.miningFee;
              }

              if(trans.toAddress == address){

                balance = balance + trans.amount;
              }

            }
            

          }
          if(block.actions){
            for(var actionHash of Object.keys(block.actions)){
              action = block.actions[actionHash]
              if(action){
                if(action.fromAccount.publicKey == address){
                  balance = balance - action.fee;
                }
              }
            }
          }

        }

      return balance;
    }

  }

  gatherMiningFees(block){
    if(block){
      let reward = 0;
      var txHashes = Object.keys(block.transactions);
      var actionHashes = Object.keys(block.actions);
      for(var hash of txHashes){
        reward += block.transactions[hash].miningFee;
      }

      for(var hash of actionHashes){
        reward += block.actions[hash].fee;
      }

      return reward;
    }

  }

  calculateTotalMiningRewards(){
    let amountOfReward = 0;
    this.chain.forEach( block =>{
      let txHashes = Object.keys(block.transactions);
      txHashes.forEach( hash =>{
        let tx = block.transactions[hash];
        if(tx.fromAddress == 'coinbase'){
          amountOfReward += tx.amount;
        }
      })
    })

    return amountOfReward;
  }

    /**
    Follows the account balance of a given wallet through current unvalidated transactions
    @param {string} $publicKey - Public key involved in transaction, either as sender or receiver
  */
  checkFundsThroughPendingTransactions(publicKey){
    var balance = 0;
    var trans;
    var action
    if(publicKey){
      var address = publicKey;

      for(var transHash of Object.keys(Mempool.pendingTransactions)){
        trans = Mempool.pendingTransactions[transHash];
        if(trans){

          if(trans.fromAddress == address){
            balance = balance - trans.amount - trans.miningFee;
          }

          if(trans.toAddress == address){
            balance = balance + trans.amount;
          }

        }else{
          return 0;
        }

      }

      if(Mempool.pendingActions){
        for(var actionHash of Object.keys(Mempool.pendingActions)){
          
          action = Mempool.pendingActions[actionHash]
          if(action){
            if(action.fromAccount.publicKey == address){
              balance = balance - action.fee;
            }
          }
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
        return {conflict:i};
      }else if(currentBlock.previousHash !== previousBlock.hash){
        console.log('*******************************************************************');
        console.log('* currentblock hash does not match previousblock hash *');
        console.log('Invalid block is :' + i + ' with hash: ' + currentBlock.hash + ' and previous hash: ' + previousBlock.hash);
        console.log('*******************************************************************');
        return {conflict:i};
      }
    }

    return true;
  }


  /**
    Criterias for validation are as follows:
    - Block has successfully calculated a valid hash
    - Block linked with previous block by including previous hash in its own hash calculation
    - Block difficulty hasn't been tempered with
    - Total challenge score matches 
    - Chain doesn't already contain this block
    - All transactions are valid
    - No double spend took place in chain
    @param {string} $block - Block to be validated
  */
  async validateBlock(block){

    var chainAlreadyContainsBlock = this.checkIfChainHasHash(block.hash);
    var merkleRootIsValid = this.recalculateMerkleRoot(block);
    // var latestBlock = this.getLatestBlock();
    // var transactionsAreValid = await this.blockContainsOnlyValidTransactions(block);
    if(!merkleRootIsValid){
      logger('ERROR: Merkle root of block is invalid')
    }
    
    if(chainAlreadyContainsBlock){
      logger('ERROR: Chain already contains block')
      return false;
    }
    else{
      return true;
    }
    
    // else if(!transactionsAreValid){
    //   logger('ERROR: Not all transactions are valid')
    //   return false;
    // }


    //Validate transactions using merkle root
    // if(!containsCurrentBlock){
      
    //   if(!isLinked){

    //     if(latestBlock.previousHash == block.previousHash){
    //       /*.*/
    //       logger('New block received has been orphaned since latest block has been mined before')
    //       return false;
    //     }
    //     // console.log('Num',block.blockNumber);
    //     // console.log('Hash',block.hash)
    //     // console.log('Prev',block.previousHash)
    //     logger('Current mined block is not linked with previous block. Sending it to orphanedBlocks');
    //     return this.getIndexOfBlockHash(block.previousHash);

    //   }else{
    //     if(block.difficulty < this.getLatestBlock().difficulty){
    //       return false;
    //     }

    //     if(block.difficulty < (block.hash.substring(0, block.difficulty)).length){
    //       return false;
    //     }

    //     // if(block.difficulty < Math.floor(Math.log10(block.challenge))-1){
    //     //   false
    //     // }
      //   return true;
      // }

    // }else if(containsCurrentBlock){
    //   logger('Chain already contains that block')
    //   return false;
    // }

  }

  validateNewBlock(block){
    return new Promise(async (resolve, reject)=>{
      try{
        var containsCurrentBlock = this.checkIfChainHasHash(block.hash);
        var isLinked = this.isBlockLinked(block);
        var latestBlock = this.getLatestBlock();
        var transactionsAreValid = await this.blockContainsOnlyValidTransactions(block);
        var rightNumberOfZeros = block.difficulty < (block.hash.substring(0, block.difficulty)).length;
        var difficultyMatchesChallenge = block.difficulty < Math.floor(Math.log10(block.challenge))-1
        //Validate transactions using merkle root
        if(containsCurrentBlock){
          logger('BLOCK SYNC ERROR: Chain already contains that block')
          resolve(false)
        }

        if(!transactionsAreValid){
          logger('BLOCK SYNC ERROR: Transactions are not all valid')
          resolve(false)
        }

        if(!isLinked){
          logger('BLOCK SYNC ERROR: Block is not linked with previous block')
          resolve(false)
        }

        // if(rightNumberOfZeros){
        //   logger('BLOCK SYNC ERROR: Difficulty does not match leading zero in hash')
        //   resolve(false)
        // }

        // if(difficultyMatchesChallenge){
        //   logger('BLOCK SYNC ERROR: Difficulty does not match challenge')
        //   resolve(false)
        // }

        resolve(true)
      }catch(e){
        console.log(e);
        resolve(false)
      }
    })
    
    
  }

  


  /**
    @desc Useful for sync requests
    @param {string} $blockNumber - Index of block
  */

  getBlockHeader(blockNumber){
    if(typeof blockNumber == 'number' && blockNumber >= 0){

      var block = this.chain[blockNumber];

      if(block){
        
        var header = {
          blockNumber:block.blockNumber,
          timestamp:block.timestamp,
          previousHash:block.previousHash,
          hash:block.hash,
          nonce:block.nonce,
          merkleRoot:block.merkleRoot,
          actionMerkleRoot:block.actionMerkleRoot,
          difficulty:block.difficulty,
          challenge:block.challenge,
          totalChallenge:block.totalChallenge,
          minedBy:block.minedBy,
        }

        return header
      }

    }

  }

  extractHeader(block){
    if(isValidBlockJSON(block)){
        
        var header = {
          blockNumber:block.blockNumber,
          timestamp:block.timestamp,
          previousHash:block.previousHash,
          hash:block.hash,
          nonce:block.nonce,
          merkleRoot:block.merkleRoot,
          actionMerkleRoot:block.actionMerkleRoot,
          difficulty:block.difficulty,
          challenge:block.challenge,
          totalChallenge:block.totalChallenge,
          minedBy:block.minedBy,
        }

        return header
      

    }else{
      logger('ERROR: Invalid block format')
    }

  }

  getAllHeaders(){
      try{
        var headers = []
          this.chain.forEach( block => headers.push(this.getBlockHeader(block.blockNumber)) )
          return headers
      }catch(e){
        console.log(chalk.red(e))
      }
    
  }

  validateBlockHeader(header){
    if(isValidHeaderJSON(header)){
      
      if(header.hash == RecalculateHash(header)){
        return true;
      }else{
        return false;
      }
    }else{
      return false;
    }
  }

  // validateHeadersOfChain(headers){
  //   return new Promise((resolve, reject)=>{
  //     if(headers){
  //       for(var i; i<headers.length; i++){
  //         let header = headers[i];
  //         if(isValidHeaderJSON(header)){
        
  //           if(header.hash == RecalculateHash(header)){
  //             let isAlreadyInChain = this.getIndexOfBlockHash(header.hash);
  
  //             if(isAlreadyInChain){
  //               resolve({error:'Chain already contains this block'})
  //             }
  
  //             if(i > 0){
  //               if(header.previousHash !== headers[i-1].previousHash){
  //                 resolve({error:'ERROR:Block is not linked with previous block'}) 
  //               }
  
  //               if(header.totalChallenge == headers[i-1].totalChallenge + header.nonce){
  //                 resolve({error:'ERROR:Total challenge did not match previous block sum'})
  //               }
  //             }
              
  //           }else{
  //             resolve({error:'ERROR:Hash recalculation did not match block hash'})
  //           }
  //         }else{
  //           resolve({error:'ERROR: Block does not have a valid format'})
  //         }
  //       }
  
  //       resolve(true);
  //     }
  //   })
    
    
  // }

  validateBlockchain(allowRollback){
    
      let isValid = this.isChainValid();
      if(isValid.conflict){
        let atBlockNumber = isValid.conflict;
        //Need to replace with side chain algorithm
        if(allowRollback){
          this.rollBackBlocks(atBlockNumber-1);
          logger('Rolled back chain up to block number ', atBlockNumber-1)
          return true;
        }else{
          return false;
        }
      }

      return true;
  }

  rollBackBlocks(blockIndex){  //Tool to roll back conflicting blocks - To be changed soon
    if(typeof blockIndex == 'number'){
      var orphanedBlocks = [];
      let length = this.chain.length;
      let numberOfBlocks = length - blockIndex;
      orphanedBlocks = this.chain.splice(-1, numberOfBlocks);
      orphanedBlocks.forEach((block)=>{
        this.unwrapBlock(block);
      })

      return orphanedBlocks;
    }
  }

  unwrapBlock(block){
    if(isValidBlockJSON(block)){
      let transactionsOfCancelledBlock = block.transactions;
      let actionsOfCancelledBlock = block.actions
      Mempool.putbackPendingTransactions(transactionsOfCancelledBlock);
      Mempool.putbackPendingActions(actionsOfCancelledBlock)
    }
    
  }

  

  validateBlockTransactions(block){
    return new Promise((resolve, reject)=>{
      if(isValidBlockJSON(block)){
        let txHashes = Object.keys(block.transactions);
        txHashes.forEach( hash =>{
          let transaction = block.transactions[hash];
          let valid = this.validateTransaction(transaction);
          if(valid.error){
            Mempool.rejectTransactions(hash)
            logger('Rejected Transaction:', hash);
            //If contains invalid tx, need to reject block alltogether
            // delete block.transactions[hash];
            resolve(false)
          }
        })

        resolve(block);
      }else{
        logger('ERROR: Must pass block object')
        resolve(false)
      }
      
    })
  }

  

  validateTransactionsForMining(transactions){
    return new Promise((resolve, reject)=>{
      if(transactions){
        let orderedTransaction = Mempool.orderTransactionsByTimestamp(transactions)
        let txHashes = Object.keys(orderedTransaction);
        
        let validTransactions = {}
        txHashes.forEach( hash =>{
          let transaction = transactions[hash];
          let valid = this.validateTransaction(transaction);
          if(!valid.error){
            validTransactions[hash] = transaction
            
          }else{
            Mempool.rejectTransactions(hash)
            logger('Rejected Transaction:', hash);
            logger('Reason: ', valid.error)
          }
        })
        resolve(validTransactions);
      }else{
        logger('ERROR: Must pass block object')
        resolve(false)
      }
      
    })
  }
  
  blockContainsOnlyValidTransactions(block){
    return new Promise((resolve, reject)=>{
      if(isValidBlockJSON(block)){
        let txHashes = Object.keys(block.transactions);
        txHashes.forEach( hash =>{
          let transaction = block.transactions[hash];
          let valid = this.validateTransaction(transaction);
          if(valid.error){
            Mempool.rejectTransactions(hash)
            logger('Rejected Transaction:', hash);
            resolve(false)
          }
        })

        let recalculatedMerkleRoot = merkleRoot(block.transactions)
        
        if(recalculatedMerkleRoot != block.merkleRoot){
          resolve(false);
        }

        resolve(true);
      }else{
        logger('ERROR: Must pass block object')
        resolve(false)
      }
      
    })
  }

  recalculateMerkleRoot(block){
    if(isValidBlockJSON(block)){
      let recalculatedMerkleRoot = merkleRoot(block.transactions);
      if(recalculatedMerkleRoot == block.merkleRoot){
        return true;
      }else{
        return false;
      }
    }else{
      return false;
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
          var isMiningReward = transaction.fromAddress == 'coinbase';

          if(!isMiningReward){

            var isChecksumValid = this.validateChecksum(transaction);
           
            let isSignatureValid = await this.validateSignature(transaction)

            let isSendingAddressValid = await validatePublicKey(transaction.fromAddress)

            let isReceivingAddressValid = await validatePublicKey(transaction.toAddress)

            let isNotCircular = transaction.fromAddress !== transaction.toAddress;
           
            var balanceOfSendingAddr = this.getBalanceOfAddress(transaction.fromAddress) //+ this.checkFundsThroughPendingTransactions(transaction.fromAddress);
           
            var amountIsNotZero = transaction.amount > 0;

            let hasMiningFee = transaction.miningFee >= this.calculateTransactionMiningFee(transaction); //check size and fee 
            
            var transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
              
            if(!isChecksumValid){
              logger('REJECTED: Transaction checksum is invalid');
              resolve({error:'REJECTED: Transaction checksum is invalid'});
            }

            if(!isSendingAddressValid){
              logger('REJECTED: Sending address is invalid');
              resolve({error:'REJECTED: Sending address is invalid'});
            }

            if(!isReceivingAddressValid){
              logger('REJECTED: Receiving address is invalid');
              resolve({error:'REJECTED: Receiving address is invalid'});
            }
              
            if(!isSignatureValid){
              logger('REJECTED: Transaction signature is invalid');
              resolve({error:'REJECTED: Transaction signature is invalid'});
            }

            if(!amountIsNotZero){
              logger('REJECTED: Amount needs to be higher than zero');
              resolve({error:'REJECTED: Amount needs to be higher than zero'});
            }

            if(!isNotCircular){
              logger("REJECTED: Sending address can't be the same as receiving address");
              resolve({error:"REJECTED: Sending address can't be the same as receiving address"});
            }

            if(!hasMiningFee){
              logger("REJECTED: Mining fee is insufficient");
              resolve({error:"REJECTED: Mining fee is insufficient"});
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
          let hasTheRightMiningRewardAmount = transaction.amount == (this.miningReward + this.calculateTransactionMiningFee(transaction));
          let transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
                  
          if(!isChecksumValid){
            resolve({error:'REJECTED: Transaction checksum is invalid'});
          }

          if(!hasTheRightMiningRewardAmount){
            resolve({error:'REJECTED: Coinbase transaction does not contain the right mining reward: '+ transaction.amount});
          }

          if(isAlreadyInChain){
            Mempool.deleteCoinbaseTransaction(transaction)
          }

          if(!isAttachedToMinedBlock){
            resolve({error:'COINBASE TX REJECTED: Is not attached to any mined block'})
          }

          if(fiveBlocksHavePast != true){
            resolve({ pending:'PENDING: Coinbase transaction needs to wait five blocks' })
          }
            
          if(!transactionSizeIsNotTooBig){
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

  validateAction(action, account){
    return new Promise(async (resolve, reject)=>{
      if(action){

          let isChecksumValid = await this.validateActionChecksum(action);
          let hasMiningFee = action.fee > 0; //check if amount is correct
          let actionIsNotTooBig = Transaction.getTransactionSize(action) < this.transactionSizeLimit;
          let balanceOfSendingAddr = this.getBalanceOfAddress(action.fromAccount.publicKey)// + this.checkFundsThroughPendingTransactions(action.fromAccount.publicKey);
          let isLinkedToWallet = validatePublicKey(action.fromAccount.publicKey);
          let isSignatureValid = await this.validateActionSignature(action, action.fromAccount.publicKey);
          let isCreateAccount = action.type == 'account' && action.task == 'create';
          

          if(account && isValidAccountJSON(account)){ 
            
            let isSentByOwner = await this.validateActionSignature(action, account.ownerKey);
      
            if(!isSentByOwner){
              resolve({error:"ERROR: Signature is not associated with sender account"})
            }
          
          }else if(isCreateAccount){
            let newAccount = action.data;
            let isValidAccount = isValidAccountJSON(newAccount);

            if(!isValidAccount){
              resolve({error:"ERROR: Account contained in create account action is invalid"})
            }

          }else{
            resolve({error:"ERROR: Could not find action's sender account"})
          }

        if(balanceOfSendingAddr < action.fee){
          resolve({error:"ERROR: Sender's balance is too low"})
        }

        if(!isSignatureValid){
          resolve({error:"ERROR: Action signature is invalid"})
        }

        if(!isChecksumValid){
          resolve({error:"ERROR: Action checksum is invalid"})
        }

        if(!isLinkedToWallet){
          resolve({error:"ERROR: Action ownerKey is invalid"})
        }

        if(!actionIsNotTooBig){
          resolve({error:'ERROR: Action size is above '+this.transactionSizeLimit+'Kb'})
        }
  
        if(!hasMiningFee){
          resolve({error:'ERROR: Action needs to contain mining fee propertional to its size'})
        }

        resolve(true);

      }else{
        resolve({error:'Account or Action is undefined'})
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
    return new Promise(async (resolve, reject)=>{
      if(transaction){
        if(validatePublicKey(transaction.fromAddress)){
          const publicKey = await ECDSA.fromCompressedPublicKey(transaction.fromAddress);
          if(publicKey){
            const verified = await publicKey.verify(transaction.hash, transaction.signature)
            resolve(verified)
          }else{
            resolve(false)
          }
          
        }else{
          resolve(false)
        }
      }else{
        resolve(false);
      }
    })
  }

  validateActionSignature(action, ownerKey){
    return new Promise(async (resolve, reject)=>{
      if(action){
        if(validatePublicKey(ownerKey)){
          const publicKey = await ECDSA.fromCompressedPublicKey(ownerKey);
          if(publicKey){
            const verified = await publicKey.verify(action.hash, action.signature)
            resolve(verified)
          }else{
            resolve(false)
          }
          
        }else{
          resolve(false)
        }
      }else{
        resolve(false);
      }
    })
  }

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
            if(blocksPast > 5){
              
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
        
        let saved = await writeToFile(this, './data/blockchain.json');
          if(saved){
              logger('Saved Blockchain file');
              resolve(true)
          }else{
              reject('ERROR: Could not save blockchain')
          } 
      }catch(e){
        reject(e);
      }
      
    })
    
  }

}

module.exports = Blockchain;



