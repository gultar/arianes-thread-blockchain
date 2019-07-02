
/////////////////////Blockchain///////////////////////
const sha256 = require('../tools/sha256');
const {  
  logger, 
  RecalculateHash, 
  writeToFile,
  validatePublicKey,
  merkleRoot, 
  readFile, } = require('../tools/utils');
const { isValidAccountJSON, isValidHeaderJSON, isValidBlockJSON } = require('../tools/jsonvalidator');
const Transaction = require('./transaction');
const BalanceTable = require('./balanceTable')
const Block = require('./block');
const { setNewChallenge, setNewDifficulty } = require('./challenge');
const chalk = require('chalk');
const ECDSA = require('ecdsa-secp256r1');
const Mempool = require('./mempool');
const fs = require('fs');
const jsonc = require('jsonc')
let _ = require('private-parts').createKey();
const PouchDB = require('pouchdb');
/**
  * @desc Basic blockchain class.
  * @param {number} $difficulty - block mining difficulty;
  * @param {object} $pendingTransactions - Transaction pool;
  * @param {number} $miningReward - Reward for mining a block;
  * @param {number} $blocksize - minimum number of transactions per block;
*/
class Blockchain{

  constructor(chain=false){
    this.chain = (chain?chain:[])
    this.chainDB = new PouchDB('./data/chainDB');
    this.balance = {}
    this.blockForks = {}
    this.miningReward = 50;
    this.blockSize = 5; //Minimum Number of transactions per block
    this.maxDepthForBlockForks = 3;
    this.transactionSizeLimit = 10 * 1024;
  }

  async createGenesisBlock(){
    return new Promise(async (resolve)=>{
        let genesisBlock = new Block(1554987342039,
          { //fromAddress, toAddress, amount, data='', type='', hash='', miningFee=false
            'maxCurrency':new Transaction
            (
              'coinbase',
              "coinbase", 
              1000 * 1000 * 1000 * 1000, 
              'Maximum allowed currency in circulation',
              'coinbaseReserve',
              false,
              0
            ),
          } 
          , {});
          genesisBlock.difficulty = '0x100000'//'0x2A353F';
          genesisBlock.totalDifficulty = genesisBlock.difficulty
          genesisBlock.challenge = setNewChallenge(genesisBlock)//average 150 000 nonce/sec
          genesisBlock.maxCoinSupply = Math.pow(10, 10);
          genesisBlock.hash = sha256( genesisBlock.maxCoinSupply + genesisBlock.difficulty + genesisBlock.challenge + genesisBlock.merkleRoot )
          genesisBlock.calculateHash();
          genesisBlock.states = {
            "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG":{  balance:10000, lastTransaction:'coinbase', },
            "AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6":{  balance:10000, lastTransaction:'coinbase', },
            "A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R":{  balance:10000, lastTransaction:'coinbase', },
            "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr":{  balance:10000, lastTransaction:'coinbase', },
          }
          
          // this.balance.states = genesisBlock.state;
          
          let addedGenesisTx = await this.chainDB.put({
              _id:genesisBlock.hash,
              [genesisBlock.hash]:genesisBlock.transactions
          })
          .catch(e => console.log(e))

          if(addedGenesisTx){
              resolve(genesisBlock)
          }else{
              reject('ERROR: Could not create genesis block')
          }
    })
  }

  saveGenesisFile(){
    return new Promise(async (resolve)=>{
      let genesisBlock = await this.createGenesisBlock();
      let saved = await writeToFile(genesisBlock, './config/genesis.json')
      if(saved){
        resolve(genesisBlock)
      }else{
        resolve({error:'Could not save genesis file'})
      }
    })
  }

  loadGenesisFile(){
    return new Promise(async (resolve)=>{
      fs.exists('./config/genesis.json', async (exists)=>{
        if(exists){
          let genesis = await readFile('./config/genesis.json');
          if(genesis){
            genesis = JSON.parse(genesis)
            resolve(genesis)
          }else{
            resolve({error:'Could not load genesis file'})
          }
        }else{
          let genesis = await this.saveGenesisFile();
          if(!genesis.error){
            resolve(genesis)
          }else{
            resolve({error:'Could not load genesis file'})
          }
        }
        
      })
      
    })
  }

  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }
  
  static initBlockchain(){
    return new Promise(async (resolve, reject)=>{
      let blockchain = {};

      const instanciateBlockchain = (chainObj) =>{
        return new Blockchain(chainObj.chain, chainObj.difficulty)
      }

      logger('Initiating blockchain');
      fs.exists('./data/blockchain.json', async (exists)=>{
        
        if(exists){
  
          // let blockchainFile = await readFile('./data/blockchain.json');
          let [readErr, blockchainString] = await jsonc.safe.read('./data/blockchain.json')
          if(readErr) { 
            resolve(false)
          }

          let [parseErr, blockchainObject] = await jsonc.safe.parse(blockchainString)
          if(parseErr){
            resolve(false)
          }

          blockchain = instanciateBlockchain(blockchainObject);
          blockchain.balance = new BalanceTable()
          let states = await blockchain.balance.loadAllStates()
          if(!states) {
            logger('ERROR: Could not load balance table')
            resolve(false)
          }
          blockchain.balance.states = states
          resolve(blockchain);
  
        }else{
  
          logger('Blockchain file does not exist')
          logger('Generating new blockchain')
          
          let newBlockchain = new Blockchain();
          let genesisBlock = await newBlockchain.loadGenesisFile()
          newBlockchain.balance = new BalanceTable(genesisBlock.states)
          let states = await newBlockchain.balance.loadAllStates()
          if(!states) {
            logger('ERROR: Could not load balance table')
            resolve(false)
          }
          newBlockchain.balance.states = states;
          newBlockchain.chain.push(newBlockchain.extractHeader(genesisBlock))
          newBlockchain.saveBlockchain();
          resolve(newBlockchain);
        }
      })
     
    })
  
  }

  pushBlock(newBlock, silent=false){
    return new Promise(async (resolve)=>{
      if(isValidBlockJSON(newBlock)){
        let isValidBlock = await this.validateBlock(newBlock);
        if(isValidBlock){
          var isLinked = this.isBlockLinked(newBlock);
          
          if(isLinked){
            
            this.chain.push(this.extractHeader(newBlock));
            if(!silent) logger(chalk.green(`[$] New Block ${newBlock.blockNumber} created : ${newBlock.hash.substr(0, 25)}...`));
            let exists = await this.chainDB.get(newBlock.hash).catch(e => {})
            if(!exists){

              let executed = await this.balance.executeTransactionBlock(newBlock.transactions)
              if(executed.errors) resolve({ error: executed.errors })

              let actionsExecuted = await this.balance.executeActionBlock(newBlock.actions)
              if(actionsExecuted.error) resolve({ error: executed.errors })
              if(newBlock.actions && actionsExecuted){
                newBlock.transactions['actions'] = newBlock.actions
              }
              
              let txConfirmed = await this.chainDB.put({
                  _id:newBlock.hash,
                  [newBlock.hash]:newBlock.transactions
              })
              .catch(e => console.log(e))
                
              if(txConfirmed){
                Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
                if(newBlock.actions) Mempool.deleteActionsFromMinedBlock(newBlock.actions)
                resolve(true);
              }else{
                  logger('ERROR: Could not add transactions to database')
                  resolve(false)
              }
            }else{
              logger('WARNING: Block transactions already exist for block:', newBlock.hash.substr(0, 25))
              Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
              resolve(true)
            }

          }else{
            let isLinkedToSomeBlock = this.chain.getIndexOfBlockHash(newBlock.previousHash)
            let isLinkedToBlockFork = this.chain.blockFork[newBlock.previousHash]
            if( isLinkedToSomeBlock || isLinkedToBlockFork ){
              let isBlockFork = await this.newBlockFork(newBlock)
              if(isBlockFork.error) resolve({error:isBlockFork.error})
              resolve(true)
            }else{
              resolve(false)
            }

          }
          
        }else{
          resolve({error:'Invalid block'})
        }
      }else{
        resolve({error:'ERROR: New block undefined'})
      }
    })

  }

  // createBlockBranch(newBlock){
  //   return new Promise(async( resolve)=>{
  //     if(this.getLatestBlock().hash != newBlock.hash){
        
  //       let isBlockNewFork = this.getLatestBlock().previousHash == newBlock.previousHash 
  //       if(isBlockNewFork){
  //         logger(chalk.yellow(`* Added new block fork ${newBlock.hash.substr(0, 25)}...`));
  //         logger(chalk.yellow(`* At block number ${newBlock.blockNumber}...`));
  //         if(this.getLatestBlock().blockFork){
  //           this.getLatestBlock().blockFork[newBlock.hash] = this.extractHeader(newBlock);
  //         }else{
  //           this.getLatestBlock().blockFork = {}
  //           this.getLatestBlock().blockFork[newBlock.hash] = this.extractHeader(newBlock);
  //         }
          
  //         resolve(
  //         {
  //           fork:{
  //             blockNumber:newBlock.blockNumber,
  //             hash:newBlock.hash,
  //             previousHash:newBlock.previousHash,

  //           }
  //         })
  //       }else{
  //         //Resolving block fork that built up over several blocks (max four)
  //         let lastBlock = this.getLatestBlock();
  //         let secondLastBlock = this.chain[lastBlock.blockNumber - 1];
  //         let thirdLastBlock = this.chain[lastBlock.blockNumber - 2];
  //         if(lastBlock.blockFork && lastBlock.blockFork[newBlock.previousHash]){
            
  //           let forkedBlock = this.getLatestBlock().blockFork[newBlock.previousHash];
  //           if(!forkedBlock) resolve({error:'ERROR: Forked block not found'})
  //           else{
  //             let parallelBranch = this.buildParallelBranch(newBlock);
            
  //           //Minus one for the newest block which has not been added
  //           let numOfBlocksToRemove = parallelBranch.length - 1;
  //           let tailBlock = parallelBranch[0];
  //             //Is tail block of the parallel branch linked with the previous chain block
  //             //to be able to merge the branch with the chain
  //             if(this.chain[tailBlock.blockNumber - 1].hash == tailBlock.previousHash){
  //               //extract the top part of the second branch which will be orphaned
  //               let orphanedBranch = this.chain.splice(-1, numOfBlocksToRemove);
  //               //add blocks of the parallel branch one by one
  //               parallelBranch.forEach( async (block)=>{

  //                 let added = await this.pushBlock(block, false)
  //                 if(added.error) resolve({error:added.error})
  //                 logger(chalk.yellow(`* Synced block from parallel branch ${chalk.white(block.blockNumber)}`))
  //                 logger(chalk.yellow(`* Hash: ${chalk.white(block.hash.substr(0, 25))}...`))
  //                 logger(chalk.yellow(`* Previous Hash: ${chalk.white(block.previousHash.substr(0, 25))}...`))
  //               })

  //               logger(chalk.yellow(`* Finished switching branch`))
  //               logger(chalk.yellow(`* Now working on head block ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
  //               //add all orphaned blocks to current chain as forked blocks
  //               orphanedBranch.forEach( block=>{
  //                 if(block){
  //                   if(block.blockFork) block.blockFork = {}
  //                   if(this.chain[block.blockNumber]){
  //                     if(this.chain[block.blockNumber].blockFork){
  //                       this.chain[block.blockNumber].blockFork[block.hash] = block; 
  //                     }else{
  //                       this.chain[block.blockNumber].blockFork = {}
  //                       this.chain[block.blockNumber].blockFork[block.hash] = block; 
  //                     }
  //                   }else{
  //                     if(this.getLatestBlock().blockFork){
  //                       this.getLatestBlock().blockFork[block.hash] = block;
  //                     }else{
  //                       this.getLatestBlock().blockFork = {};
  //                       this.getLatestBlock().blockFork[block.hash] = block;
  //                     }
                      
  //                   }
  //                 }
  //               })
  //               resolve({resolved:true})
  //             }else{
  //               resolve({error:'ERROR: parallel branch is not linked with current chain'})
  //             }
  //           }
            
            
  //         }else if(secondLastBlock.blockFork && secondLastBlock.blockFork[newBlock.previousHash]){
            
  //           let forkedBlock = secondLastBlock.blockFork[newBlock.previousHash];
  //           if(!forkedBlock) resolve({error:'ERROR: Forked block not found'})

  //           //Raising block fork one block higher
  //           this.getLatestBlock().blockFork[newBlock.hash] = this.extractHeader(newBlock);
  //           let exists = await this.chainDB.get(newBlock.hash).catch(e => {})
  //           if(!exists){
  //             let txConfirmed = await this.chainDB.put({
  //                 _id:newBlock.hash,
  //                 [newBlock.hash]:newBlock.transactions
  //             })
  //             .catch(e => console.log(e))
                
  //             if(txConfirmed){
  //               Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
  //               resolve(
  //                 {
  //                   fork:{
  //                     blockNumber:newBlock.blockNumber,
  //                     hash:newBlock.hash,
  //                     previousHash:newBlock.previousHash,
  //                   }
  //               })
  //             }else{
  //                 logger('ERROR: Could not add transactions to database')
  //                 resolve(false)
  //             }
  //           }else{
  //             logger('WARNING: Block transactions already exist for block:', newBlock.hash.substr(0, 25))
  //             Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
  //             resolve(
  //               {
  //                 fork:{
  //                   blockNumber:newBlock.blockNumber,
  //                   hash:newBlock.hash,
  //                   previousHash:newBlock.previousHash,
  //                 }
  //             })
  //           }

  //         }else if(thirdLastBlock.blockFork && thirdLastBlock.blockFork[newBlock.previousHash]){
            
  //           let forkedBlock = thirdLastBlock.blockFork[newBlock.previousHash];
  //           if(!forkedBlock) resolve({error:'ERROR: Forked block not found'})
  //           //Raising block fork one block higher
  //           this.chain[thirdLastBlock.blockNumber + 1].blockFork[newBlock.hash] = this.extractHeader(newBlock);
  //           await this.chainDB.put({
  //               _id:newBlock.hash,
  //               [newBlock.hash]:newBlock.transactions
  //           })
  //           .catch(e => console.log(e))
  //           resolve(
  //             {
  //               fork:{
  //                 blockNumber:newBlock.blockNumber,
  //                 hash:newBlock.hash,
  //                 previousHash:newBlock.previousHash,
  //               }
  //           })

  //         }else{
  //           resolve({error:'ERROR: Could not resolve chain, head block has not been forked'})
  //         }
  //       }
        
  //     }else{
  //       resolve({error:'ERROR: Cannot create branch with block identical to head block'})
  //     }
      
  //   })
  // }
  newBlockFork(newBlock){
    return new Promise(async (resolve)=>{
      if(this.getLatestBlock().hash != newBlock.hash){
         
          /**
           * b: Canonical Block
           * f: Forked block
           * r: Root of fork
           *           |-[b][b] <-- [b] Case 1: Canonical chain will be extended, then fork will be orphaned
           * [b][b][b][r]
           *           |-[f][f] <-- [f] Case 2: Forked chain will be extended, then, if total difficulty is higher, 
           *           |              forked chain will be adopted, the other branch will be orphaned
           *           |-[f] <-- [f] Case 3: Handles more than one forked block
           * 
           */
          let previousBlockNumber = this.getIndexOfBlockHash(newBlock.previousHash)
          if(previousBlockNumber == -1 && !this.blockForks[newBlock.previousHash]){
            resolve({ error:'ERROR: Could not create block fork. New block is not linked' })
          }else{
            
            if(previousBlockNumber >= 0 && !this.blockForks[newBlock.previousHash]){
              let rootBlock = this.chain[previousBlockNumber];
              //This is the first block of the fork
              //Store information on the fork to easily track when a block belongs to the fork
              this.blockForks[newBlock.hash] = {
                root:{ 
                  hash:rootBlock.hash,
                  blockNumber:rootBlock.blockNumber,
                },
                previousHash:rootBlock.hash,
                size:1,
              }
              logger(chalk.yellow(`* Added new block fork ${newBlock.hash.substr(0, 25)}...`));
              logger(chalk.yellow(`* At block number ${newBlock.blockNumber}...`));
              //Store actual block on the chain, as an array
              let forkedChain = []
              forkedChain.push(newBlock)
              this.chain[previousBlockNumber].fork = {}
              this.chain[previousBlockNumber].fork[newBlock.hash] = forkedChain
              resolve(true)
            }else if(previousBlockNumber >= 0 && this.blockForks[newBlock.previousHash]){
              //Extend already existing block fork
              let previousForkInfo = this.blockForks[newBlock.previousHash]

              //Details of the block fork, to avoid crowding the canonical chain with superfluous data
              this.blockForks[newBlock.hash] = {
                root:{
                  hash:previousForkInfo.root.hash,
                  blockNumber:previousForkInfo.root.blockNumber,
                },
                previousHash:newBlock.previousHash,
                size:previousForkInfo.size+1,
              }
              
              let rootBlock = this.chain[previousForkInfo.root.blockNumber]
              let forkedChain = rootBlock.fork[newBlock.previousHash]
              let isNewBlockLinked = newBlock.previousHash == forkedChain[forkedChain.length - 1].hash
              if(isNewBlockLinked){
                forkedChain.push(newBlock)
                let result = await this.resolveBlockFork(forkedChain)
                if(result.error) resolve({error:result.error})
                else resolve(true)
              }else{
                resolve({ error:'ERROR: Could not create block fork. New block is not linked' })
              }
              
            }else{
              resolve({ error:'ERROR: Could not create block fork. New block is not linked' })
            }
          }
      }
    })
  }

  resolveBlockFork(forkedChain){
    return new Promise((resolve)=>{
      if(!forkedChain){
        resolve({ error:'Cannot resolve conflict with empty block fork' })
      }else{
        let forkLength = forkedChain.length
        let lastBlockOfFork = forkedChain[forkLength - 1]
        let forkChainHasMoreWork = lastBlockOfFork.totalDifficulty > this.getLatestBlock().totalDifficulty
        if(forkChainHasMoreWork){

            let isValidTotalDifficulty = this.calculateWorkDone(forkedChain)
            if(!isValidTotalDifficulty){
              logger('Is not valid total difficulty')
            }

            let startRemovingBlocksAt = forkedChain[0].blockNumber
            let numberOfBlocks = this.getLatestBlock().blockNumber - startRemovingBlocksAt
            let orphanedChain = this.chain.splice(startRemovingBlocksAt, numberOfBlocks)
            let errors = []

            forkedChain.forEach( async(block)=>{
              if(orphanedChain){
                let blockAdded = await this.pushBlock(block, true)
                if(blockAdded.error){
                  errors.push(blockAdded.error)
                }else{
                  logger(chalk.yellow(`* Synced block from parallel branch ${chalk.white(block.blockNumber)}`))
                  logger(chalk.yellow(`* Hash: ${chalk.white(block.hash.substr(0, 25))}...`))
                  logger(chalk.yellow(`* Previous Hash: ${chalk.white(block.previousHash.substr(0, 25))}...`))
                }
              }else{
                logger('ERROR: Could not splice blockchain')
              }
              

            })

            if(errors.length > 0){
              logger('Rolled back on block changes')
              // this.chain.splice(startRemovingBlocksAt, numberOfBlocks)
              // this.chain.concat(orphanedChain)
              resolve({ error:'Canonical chain contains more work. Staying on this one' })
            }else{
              logger(chalk.yellow(`* Finished switching branch`))
              logger(chalk.yellow(`* Now working on head block ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
              resolve(true)
            }
            
        }else{
          resolve({ error:'Canonical chain contains more work. Staying on this one' })
        }
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
            this.getLatestBlock().blockFork[newBlock.hash] = this.extractHeader(newBlock);
          }else{
            this.getLatestBlock().blockFork = {}
            this.getLatestBlock().blockFork[newBlock.hash] = this.extractHeader(newBlock);
          }

          await this.chainDB.put({
            _id:newBlock.hash,
            [newBlock.hash]:newBlock.transactions
         })
          .catch(e => console.log(e))
          resolve(
          {
            fork:{
              blockNumber:newBlock.blockNumber,
              hash:newBlock.hash,
              previousHash:newBlock.previousHash,

            }
          })
        }else{
          
          const extendParallelBranch = async (newBlock, previousBlock) =>{
            if(newBlock && previousBlock){
              let forkedBlock = previousBlock.blockFork[newBlock.previousHash];
              if(!forkedBlock) return {error:'ERROR: Forked block not found'};
              this.chain[previousBlock.blockNumber + 1].blockFork[newBlock.hash] = this.extractHeader(newBlock);
              await this.chainDB.put({
                _id:newBlock.hash,
                [newBlock.hash]:newBlock.transactions
              })
              .catch(e => console.log(e))
              return true
            }
          }

          let topIndex = this.chain.length - 1;
          let extended = false
          if(this.getLatestBlock().blockFork){
            if(this.getLatestBlock().blockFork[newBlock.previousHash]){
              let switchedBranch = await this.switchWorkingBranch(newBlock)
              if(switchedBranch.error) resolve({error:switchedBranch.error})
              resolve(true)
            }
          }

          let depth = topIndex - this.maxDepthForBlockForks
          let secondLast = topIndex - 1;
          for(var i=secondLast; i < depth; i--){
            let currentBlock = this.chain[i];
            if(currentBlock.blockFork){
              if(currentBlock.blockFork[newBlock.previousHash]){
                extended = extendParallelBranch(newBlock, currentBlock)
                if(extended.error) resolve({error:extended.error})
                logger(chalk.yellow(`* Extended block fork with block ${newBlock.hash.substr(0, 25)}...`));
                logger(chalk.yellow(`* At block number ${newBlock.blockNumber}...`));
                logger(chalk.yellow(`* Previous block ${currentBlock.hash.substr(0, 25)}...`));
                resolve(true)
              }
            }
          }
        }
        resolve(false)
      }else{
        resolve(false)
      }
      
    })
  }

  switchWorkingBranch(newBlock){
    return new Promise(async(resolve)=>{
            let forkedBlock = this.getLatestBlock().blockFork[newBlock.previousHash];
            if(!forkedBlock) resolve({error:'ERROR: Forked block not found'})
            
            let parallelBranch = await this.buildParallelBranch(newBlock);
            
            //Minus one for the newest block which has not been added
            let numOfBlocksToRemove = parallelBranch.length - 1;
            let tailBlock = parallelBranch[0];
              //Tail block of the parallel branch has to be linked with the previous block in chain 
              //to be able to merge the branch with the chain
            let previousBlock = this.chain[tailBlock.blockNumber - 1]
            if(previousBlock.hash == tailBlock.previousHash){
              //extract the top part of the second branch which will be orphaned
              let orphanedBranch = this.chain.splice(-1, numOfBlocksToRemove);
              //add blocks of the parallel branch one by one
              logger(chalk.yellow(`* Switching branch!`))
              parallelBranch.forEach( async (block)=>{
                let added = await this.pushBlock(block, false)
                if(added.error) resolve({error:added.error})
                logger(chalk.yellow(`* Synced block from parallel branch ${chalk.white(block.blockNumber)}`))
                logger(chalk.yellow(`* Hash: ${chalk.white(block.hash.substr(0, 25))}...`))
                logger(chalk.yellow(`* Previous Hash: ${chalk.white(block.previousHash.substr(0, 25))}...`))
              })

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
              resolve(true)
            }else{
              resolve({error:'ERROR: parallel branch is not linked with current chain'})
            }
    })
  }

  buildParallelBranch(headBlock){
    let parallelBranch = [];
    let workingBlock = headBlock;
    let previousBlock = {}
    parallelBranch.unshift(workingBlock)
    let lastIndex = headBlock.blockNumber
    for(var i=lastIndex-1; i>0; i--){
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

//   async mineNextBlock(block, ipAddress, verbose){
//     return new Promise((resolve)=>{
//       let lastBlock = this.selectNextPreviousBlock();
//       block.blockNumber = this.chain.length;
//       block.previousHash = lastBlock.hash;
//       block.challenge = setChallenge(lastBlock.challenge, lastBlock.startMineTime, lastBlock.endMineTime)
//       block.difficulty = setDifficulty(lastBlock.difficulty, lastBlock.challenge, this.chain.length);
      
//       logger('Current Challenge:', block.challenge)
//       logger(chalk.cyan('Adjusted difficulty to :', block.difficulty))
//       block.mine(block.difficulty)
//       .then(async (success)=>{
        
//         process.ACTIVE_MINER.kill()
//         process.ACTIVE_MINER = false;
        
//         if(success){ 
//           block = success;
//           if(this.validateBlock(block)){

//             block.totalChallenge = await this.calculateWorkDone() + block.nonce;
//             block.minedBy = ipAddress;
//             this.pushBlock(block, false);

//             if(!verbose){

//               console.log(chalk.cyan('\n********************************************************************'))
//               console.log(chalk.cyan('* Block number : ')+block.blockNumber);
//               console.log(chalk.cyan('* Block Hash : ')+ block.hash.substr(0, 25)+"...")
//               console.log(chalk.cyan('* Previous Hash : ')+ block.previousHash.substr(0, 25)+"...")
//               console.log(chalk.cyan("* Block successfully mined by : ")+block.minedBy+chalk.cyan(" at ")+displayTime()+"!");
//               console.log(chalk.cyan("* Challenge : "), block.challenge);
//               console.log(chalk.cyan("* Block time : "), (block.endMineTime - block.startMineTime)/1000)
//               console.log(chalk.cyan("* Nonce : "), block.nonce)
//               console.log(chalk.cyan("* Total Challenge : "), block.totalChallenge)
//               console.log(chalk.cyan('* Number of transactions in block : '), Object.keys(block.transactions).length)
//               console.log(chalk.cyan('********************************************************************\n'))
              
//             }else{
//               let header = this.extractHeader(block)
//               console.log(chalk.cyan(JSON.stringify(header, null, 2)))
//             }
            
//             resolve(success);

//           }else{
//             // logger('Block is not valid');
//             resolve(false)
            
//           }
//         }else{
//           // logger('Mining aborted. Peer has mined a new block');
//           resolve(false)
//         }

        

//       })
//     })
    

//   }
  calculateWorkDone(chain=this.chain){
    let total = 0n;
    chain.forEach( block=>{
      let difficulty = BigInt(parseInt(block.difficulty, 16))
      total += difficulty;
    })

    return total.toString(16);
  }

  // calculateWorkDone(chain=this.chain){
  //   let total = 0;
  //   chain.forEach( block=>{
  //     total += block.nonce;
  //   })

  //   return total;
  // }


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
          let transaction = this.chainDB
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

  getBalance(publicKey){
      return new Promise(async (resolve)=>{
        var address = publicKey;
        let balance = 0;
        var trans;
        var action;
        if(!publicKey){
          logger("ERROR: Can't get balance of undefined publickey")
          resolve(false)
        }
          for(var block of this.chain){
            let transactions = await this.chainDB.get(block.hash).catch( e=> console.log(e))
            transactions = transactions[transactions._id]
            if(transactions){
                for(var transHash of Object.keys(transactions)){
              
                    trans = transactions[transHash]
                    if(trans){
                      if(trans.fromAddress == address){
        
                        balance = balance - trans.amount - trans.miningFee;
                      }
        
                      if(trans.toAddress == address){
        
                        balance = balance + trans.amount;
                      }
        
                    }
                    
        
                  }
                  if(transactions.actions){
                    for(var actionHash of Object.keys(transactions.actions)){
                      action = transactions.actions[actionHash]
                      if(action){
                        if(action.fromAccount.publicKey == address){
                          balance = balance - action.fee;
                        }
                      }
                    }
                  }
            }

  
          }
  
        resolve(balance)
      })
    

  }

  checkBalance(publicKey){
    let walletState = this.balance.getBalance(publicKey)
    if(walletState){
      return walletState.balance;
    }else{
      return 0
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

  getMiningFees(block){
      return new Promise(async(resolve)=>{
        if(block){
            let reward = 0;
            let transactions = await this.chainDB.get(block.hash).catch( e=> console.log(e))
            transactions = transactions[transactions._id]
            var txHashes = Object.keys(transactions);
            var actionHashes = Object.keys(transactions.actions);
            for(var hash of txHashes){
              reward += transactions[hash].miningFee;
            }
      
            for(var hash of actionHashes){
              reward += transactions.actions[hash].fee;
            }
      
           resolve(reward)
          }
      })

  }

  calculateTotalMiningRewards(){
    let amountOfReward = 0;
    this.chain.forEach( async(block) =>{
    let transactions = await this.chainDB.get(block.hash).catch( e=> console.log(e))
    transactions = transactions[transactions._id]
      let txHashes = Object.keys(transactions);
      txHashes.forEach( hash =>{
        let tx = transactions[hash];
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

  async getTransactionHistory(publicKey){
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
          let transactions = await this.chainDB.get(block.hash).catch( e=> console.log(e))
          transactions = transactions[transactions._id]
          for(var transHash of Object.keys(transactions)){
            trans = transactions[transHash]
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
      this.chain.forEach(async (block) =>{
        let transactions = await this.chainDB.get(block.hash).catch( e=> console.log(e))
        transactions = transactions[transactions._id]
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

  getTotalDifficulty(){
      let total = BigInt(1);

      this.chain.forEach( block=>{
        total += BigInt(parseInt(block.difficulty, 16))
      })

      return total.toString(16);
  }

  validateBlockTimestamp(block){
    let timestamp = block.timestamp;
    let twentyMinutesInTheFuture = 30 * 60 * 1000
    if(timestamp > this.chain[block.blockNumber - 1].timestamp && timestamp < (Date.now() + twentyMinutesInTheFuture) ){
      return true
    }else{
      return false
    }
    
  }

  validateDifficulty(block){
    let previousBlock = this.chain[block.blockNumber - 1]
    if(previousBlock){
      let difficultyRecalculated = setNewDifficulty(previousBlock, block);
      let parsedRecalculatedDifficulty = BigInt(parseInt(difficultyRecalculated, 16))
      let parsedActualdifficulty = BigInt(parseInt(block.difficulty, 16))
      if(parsedActualdifficulty == parsedRecalculatedDifficulty){
        return true;
      }else{
        return false;
      }
    }
  }

  validateChallenge(block){
    let recalculatedChallenge = setNewChallenge(block)
    let parsedRecalculatedChallenge = BigInt(parseInt(recalculatedChallenge, 16))
    let parsedActualChallenge = BigInt(parseInt(block.challenge, 16))
    if(parsedActualChallenge == parsedRecalculatedChallenge){
      return true
    }else{
      return false
    }
  }


  /**
    Criterias for validation are as follows:
    - Block has successfully calculated a valid hash
    - Block linked with previous block by including previous hash in its own hash calculation
    - Block difficulty hasn't been tempered with
    - Total challenge score matches 
    - Chain doesn't already contain this block
    - Timestamp is greater than previous timestamp
    - All transactions are valid
    - No double spend took place in chain
    @param {string} $block - Block to be validated
  */
  async validateBlock(block){
    return new Promise(async (resolve)=>{
      var chainAlreadyContainsBlock = this.checkIfChainHasHash(block.hash);
      var isValidHash = block.hash == RecalculateHash(block);
      var isValidTimestamp = this.validateBlockTimestamp(block)
      var isValidDifficulty = this.validateDifficulty(block);
      var isValidChallenge = this.validateChallenge(block);
      var merkleRootIsValid = false;
      var hashIsBelowChallenge = BigInt(parseInt(block.hash, 16)) <= BigInt(parseInt(block.challenge, 16))
      //validate difficulty
      var difficultyIsAboveMinimum = BigInt(parseInt(block.difficulty, 16)) >= BigInt(parseInt(this.chain[0].difficulty, 16))

      if(!difficultyIsAboveMinimum){
        logger('ERROR: Difficulty level must be above minimum set in genesis block')
      }

      if(!isValidTimestamp){
        logger('ERROR: Is not valid timestamp')
      }

      if(!hashIsBelowChallenge){
        logger('ERROR: Hash value must be below challenge value')
      }

      if(!isValidDifficulty){
        logger('ERROR: Recalculated difficulty did not match block difficulty')
      }

      if(!isValidChallenge){
        logger('ERROR: Recalculated challenge did not match block challenge')
      }

      if(block.transactions){
        merkleRootIsValid = await this.isValidMerkleRoot(block.merkleRoot, block.transactions);
      }else{
        let transactions = await this.chainDB.get(block.hash).catch( e=> console.log('Cannot get transactions to validate merkleRoot'));
        if(transactions){
          merkleRootIsValid = await this.isValidMerkleRoot(block.merkleRoot, transactions);
        }
      }

      if(!isValidHash){
        logger('ERROR: Is not valid block hash')
        resolve(false)
      }

      // if(!timestampIsGreaterThanPrevious){
      //   logger('ERROR: Block Timestamp must be greater than previous timestamp ')
      //   resolve(false)
      // }

      if(!merkleRootIsValid){
        logger('ERROR: Merkle root of block IS NOT valid')
        resolve(false)
      }
    
      
      if(chainAlreadyContainsBlock){
        logger('ERROR: Chain already contains block')
        resolve(false)
      }
      

      resolve(true)
    })
    
  }

  validateNewBlock(block){
    return new Promise(async (resolve, reject)=>{
      try{
        var containsCurrentBlock = this.checkIfChainHasHash(block.hash);
        var isLinked = this.isBlockLinked(block);
        var latestBlock = this.getLatestBlock();
        var transactionsAreValid = await this.blockContainsOnlyValidTransactions(block);
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
          totalDifficulty:block.totalDifficulty,
          challenge:block.challenge,
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
      orphanedBlocks.forEach((block)=>{})

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

  isValidMerkleRoot(root, transactions){
      if(transactions && root){
        let recalculatedMerkleRoot = merkleRoot(transactions);
        if(recalculatedMerkleRoot == root){
            return true;
        }else{
            return false;
        }
      }else{
        logger('Undefined root or transactions');
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
            var balanceOfSendingAddr = await this.checkBalance(transaction.fromAddress) //+ this.checkFundsThroughPendingTransactions(transaction.fromAddress);
            let hasEnoughFunds = balanceOfSendingAddr >= transaction.amount + transaction.miningFee
            var amountIsNotZero = transaction.amount > 0;
            let hasMiningFee = transaction.miningFee >= this.calculateTransactionMiningFee(transaction); //check size and fee 
            var transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
              
            if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
            if(!isSendingAddressValid) resolve({error:'REJECTED: Sending address is invalid'});
            if(!isReceivingAddressValid) resolve({error:'REJECTED: Receiving address is invalid'});
            if(!isSignatureValid) resolve({error:'REJECTED: Transaction signature is invalid'});
            if(!amountIsNotZero) resolve({error:'REJECTED: Amount needs to be higher than zero'});
            if(!isNotCircular) resolve({error:"REJECTED: Sending address can't be the same as receiving address"});
            if(!hasMiningFee) resolve({error:"REJECTED: Mining fee is insufficient"});
            if(!transactionSizeIsNotTooBig) resolve({error:'REJECTED: Transaction size is above 10KB'});
            if(!hasEnoughFunds) resolve({error:'REJECTED: Sender does not have sufficient funds'});

          }else if(isMiningReward){
            
            let isValidCoinbaseTransaction = await this.validateCoinbaseTransaction(transaction)

            if(isValidCoinbaseTransaction.error) resolve({error:isValidCoinbaseTransaction.error})

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
          // let fiveBlocksHavePast = await this.waitFiveBlocks(transaction);
          let isAttachedToMinedBlock = await this.coinbaseTxIsAttachedToBlock(transaction);
          let isAlreadyInChain = await this.getTransactionFromChain(transaction.hash);
          let hasTheRightMiningRewardAmount = transaction.amount == (this.miningReward + this.calculateTransactionMiningFee(transaction));
          let transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
                  
          if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
          if(!hasTheRightMiningRewardAmount) resolve({error:'REJECTED: Coinbase transaction does not contain the right mining reward: '+ transaction.amount});
          if(isAlreadyInChain) Mempool.deleteCoinbaseTransaction(transaction)
          if(!isAttachedToMinedBlock) resolve({error:'COINBASE TX REJECTED: Is not attached to any mined block'})
          if(!transactionSizeIsNotTooBig) resolve({error:'COINBASE TX REJECTED: Transaction size is above '+this.transactionSizeLimit+'Kb'});
          
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
          let balanceOfSendingAddr = await this.checkBalance(action.fromAccount.publicKey)// + this.checkFundsThroughPendingTransactions(action.fromAccount.publicKey);
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

    let block = this.getBlockFromHash(transaction.blockHash)
    if(block.hash == transaction.blockHash){
      found = block;
    }
        
    return found
  }

  async saveBlockchain(){
    return new Promise(async (resolve, reject)=>{
      try{
        
        // let saved = await writeToFile(this, './data/blockchain.json');
        let chain = {
            chain:this.chain
        } 
        let data = await jsonc.stringify(chain);
        

        if(data){
          const [err, success] = await jsonc.safe.write('./data/blockchain.json', data);
          const savedStates = await this.balance.saveStates();
          if(err) resolve(false)
          else{
            if(!savedStates) resolve(false)
            resolve(true)
          }
        }
        
        
         
      }catch(e){
        reject(e);
      }
      
    })
    
  }

}

module.exports = Blockchain;

