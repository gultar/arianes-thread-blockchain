/**
 TFLB | Thousandfold Blockchain
 @author: Sacha-Olivier Dulac
*/


/////////////////////Blockchain///////////////////////
const sha256 = require('../tools/sha256');
const {  
  logger, 
  RecalculateHash, 
  writeToFile,
  validatePublicKey,
  merkleRoot, 
  readFile, } = require('../tools/utils');
const { isValidAccountJSON, isValidHeaderJSON, isValidBlockJSON, isValidTransactionJSON } = require('../tools/jsonvalidator');
const Transaction = require('./transaction');
const BalanceTable = require('./balanceTable');
const AccountTable = require('./accountTable');
const ContractTable = require('./contractTable');
const Stack = require('../contracts/build/callStack')
const VMController = require('./vmController')

/*************Smart Contract VM************** */
const vmMaster = require('../contracts/vmEngine/vmMaster')
/******************************************** */

const Block = require('./block');
const { setNewChallenge, setNewDifficulty, Difficulty } = require('./challenge');
const chalk = require('chalk');
const ECDSA = require('ecdsa-secp256r1');
const fs = require('fs');
let _ = require('private-parts').createKey();
const genesis = require('../tools/getGenesis')
const PouchDB = require('pouchdb');
const Database = require('./db')
/**
  * @desc Basic blockchain class.
  * @param {Array} $chain Possibility of instantiating blockchain with existing chain. 
  *                       Not handled by default
*/
class Blockchain{

  constructor(chain=[], mempool){
    this.chain = chain
    this.chainDB = new Database('blockchain');
    this.accountTable = new AccountTable();
    this.balance = new BalanceTable(this.accountTable)
    this.contractTable = new ContractTable({
      getCurrentBlock:()=>{
        return this.getLatestBlock()
      }
    })
    this.stack = new Stack({
      accountTable:this.accountTable,
      contractTable:this.contractTable,
      getBlockNumber:()=>{
        return this.getLatestBlock()
      }
    })
    this.vmController = new VMController({
      contractTable:this.contractTable
    })
    this.spentTransactionHashes = []
    this.difficulty = new Difficulty(genesis)
    this.mempool = mempool
    this.blockForks = {}
    this.isSyncingBlocks = false
    this.branches = {}
    this.unlinkedBranches = {}
    this.miningReward = 50;
    this.blockSize = 5; //Minimum Number of transactions per block
    this.maxDepthForBlockForks = 3;
    this.transactionSizeLimit = 10 * 1024;
  }

  async createGenesisBlock(){
    let genesisBlock = new Block(1554987342039,
      { 
        'maxCurrency':new Transaction
        ({
          fromAddress:'coinbase',
          toAddress:'coinbase',
          amount:1000 * 1000 * 1000 * 1000,
          data:'Maximum allowed currency in circulation',
          type:'coinbaseReserve',
          hash:false,
          miningFee:0
        }),
      }, {});
      genesisBlock.difficulty = '0x100000';//'0x2A353F';
      genesisBlock.totalDifficulty = genesisBlock.difficulty
      genesisBlock.challenge = setNewChallenge(genesisBlock)
      genesisBlock.maxCoinSupply = Math.pow(10, 10);
      genesisBlock.hash = sha256( genesisBlock.maxCoinSupply + genesisBlock.difficulty + genesisBlock.challenge + genesisBlock.merkleRoot )
      genesisBlock.calculateHash();
      genesisBlock.states = {
        //Other public addresses can be added to initiate their balance in the genesisBlock
        //Make sure at least one of the them has some funds, otherwise no transactions will be possible
        "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG":{ balance:10000 },
        "AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6":{ balance:10000 },
        "A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R":{ balance:10000 },
        "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr":{ balance:10000 },
      }

      return genesisBlock
  }
  /**
   * Stores Genesis block to database as well as coinstore transaction
   * @param {Block} genesisBlock 
   */
  genesisBlockToDB(genesisBlock){
    return new Promise(async (resolve)=>{
      
      let added = await this.chainDB.put({
          id:'0',
          key:'0',
          value:genesisBlock
      })

      if(added.error) resolve({error:added.error})
      resolve(added)
        
    })
    
  }

  /**
   * Replaces current Genesis block with another version
   * Use carefully because it can invalidate the whole blockchain
   * @param {Block} peerGenesisBlock 
   */
  genesisBlockSwap(peerGenesisBlock){
    return new Promise(async (resolve)=>{
      if(peerGenesisBlock){
        if(peerGenesisBlock.hash !== this.chain[0].hash && peerGenesisBlock.blockNumber.toString() == '0'){
          this.chain[0] = peerGenesisBlock
          let addedNewGenesisBlock = await this.chainDB.add({
              _id:'0',
              ['0']:peerGenesisBlock
          })
          resolve(addedNewGenesisBlock)
        }else{
          resolve(true)
        }

      }
    })
    
  }
  /**
   * Creates a new genesisBlock json file in /config
   * Needed to create a new blockchain
   */
  saveGenesisFile(){
    return new Promise(async (resolve)=>{
      let genesisBlock = this.createGenesisBlock();
      let saved = await writeToFile(genesisBlock, './config/genesis.json')
      if(saved){
        resolve(genesisBlock)
      }else{
        resolve({error:'Could not save genesis file'})
      }
    })
  }

  /**
   * Fetches existing genesisBlock
   */
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

  addBlockToChain(newBlock, silent=false){
    return new Promise(async (resolve)=>{
      //Push block header to chain
      
      let errors = {}
      let newHeader = this.extractHeader(newBlock)

      let executed = await this.balance.runBlock(newBlock)
      if(executed.error) errors['Balance error'] = executed.error
      else{

        let saved = await this.balance.saveBalances(newBlock)
        if(saved.error) resolve({error:saved.error})

        let actions = newBlock.actions || {}
        let allActionsExecuted = await this.executeActionBlock(actions)
        if(allActionsExecuted.error) errors['Action Call error'] = allActionsExecuted.error
        
        let actionsDeleted = await this.mempool.deleteActionsFromMinedBlock(actions)
        if(!actionsDeleted) errors['Mempool action deletion error'] = 'ERROR: Could not delete actions from Mempool' 
        
        let callsExecuted = await this.runTransactionCalls(newBlock);
        if(callsExecuted.error) errors['Transaction Call error'] = callsExecuted.error
        
        let transactionsDeleted = await this.mempool.deleteTransactionsFromMinedBlock(newBlock.transactions)
        if(!transactionsDeleted) errors['Mempool transaction deletion error'] = 'ERROR: Could not delete transactions from Mempool' 
        
        
        
        //Verify is already exists
        if(Object.keys(errors).length > 0){
          this.isBusy = false
          resolve({error: errors})
        }else{
          
          this.spentTransactionHashes.push(...newHeader.txHashes)
          this.chain.push(newHeader);
          let added = await this.addBlockToDB(newBlock)
          if(added){
            if(added.error) resolve({error:added.error})

            
            let statesSaved = await this.contractTable.saveStates()
            if(statesSaved.error) console.log('State saving error', statesSaved.error)
            
            let saved = await this.saveLastKnownBlockToDB()
            if(saved.error) console.log('Saved last block', saved)
            
            if(!silent) logger(chalk.green(`[$] New Block ${newBlock.blockNumber} created : ${newBlock.hash.substr(0, 25)}...`));
            this.isBusy = false
            resolve(true);
            
          }else{

            this.isBusy = false
            resolve({ error:'Could not push new block' })
          }
          
        }
      }
    })
  }

  /**
   * Validate and add block to database and blockchain
   * @param {Block} newBlock 
   * @param {boolean} silent 
   */
  pushBlock(newBlock, silent=false){
    return new Promise(async (resolve)=>{
      if(isValidBlockJSON(newBlock)){
        let isValidBlock = await this.validateBlock(newBlock);
        if(isValidBlock.error){
          resolve({error:isValidBlock.error})
        }
        else{

          if(!this.isBusy){
            var isLinked = this.isBlockLinked(newBlock);
            if(isLinked){
              this.isBusy = true
              
              let added = await this.addBlockToChain(newBlock, silent)
              if(added.error) resolve({error:added.error})
              else resolve(added)
  
            }else{
              let branched = await this.blockchainBranches(newBlock)
              this.isBusy = false
              if(branched.error) resolve({error:branched.error});
              else{
                if(branched.staying){
                  logger(chalk.yellow(`* Staying on main blockchain`))
                  logger(chalk.yellow(`* Head block is ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
                }else if(branched.outOfSync){
                  logger(chalk.yellow(`* Trying to sync with peers' blockchains`))
                }else if(branched.synced){
                  logger(chalk.yellow(`* Switched blockchain branches`))
                  logger(chalk.yellow(`* Head block is now ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
                }else if(branched.added){
                  logger(chalk.yellow(`* Added new block fork ${newBlock.hash.substr(0, 25)}...`));
                  logger(chalk.yellow(`* At block number ${newBlock.blockNumber}...`));
                }
                resolve(branched)
              }
            
            }
          }else{
            resolve({isBusy:true})
          }
          
        }
      }else{
        resolve({error:'ERROR: New block undefined'})
      }
    })

  }

  
  // newBlockFork(newBlock){
  //   return new Promise(async (resolve)=>{
  //     if(this.getLatestBlock().hash != newBlock.hash){
          
  //         /**
  //          * b: Canonical Block
  //          * f: Forked block
  //          * r: Root of fork
  //          *           |-[b][b]! <-- [b] Case 1: Canonical chain will be extended, then fork will be orphaned
  //          * [b][b][b][r]
  //          *           |-[f][f]X <-- [f] Case 2: Forked chain will be extended, then, if total difficulty is higher, 
  //          *           |              forked chain will be adopted, the other branch will be orphaned
  //          *           |-[f]X    <--  [f] Case 3: Handles more than one forked block
  //          * Terms:
  //          * - Fork root, is the block mined before block fork happens. Both blocks are linked to it
  //          * 
  //          */
          
  //         let forkRootBlockNumber = this.getIndexOfBlockHash(newBlock.previousHash)
  //         if(forkRootBlockNumber < 0 && !this.blockForks[newBlock.previousHash]){

  //           resolve({ error:'ERROR: Could not create block fork. New block is not linked' })

  //         }else{
  //           //Creates a new fork entry. One of the two branches of the fork will, in the end, be built upon
  //           const addNewFork = (newBlock) =>{
  //               //Store information on the fork to easily track when a block belongs to the fork
  //               this.blockForks[newBlock.hash] = {
  //                 root:newBlock.previousHash,
  //                 previousHash:newBlock.previousHash,
  //                 hash:newBlock.hash,
  //                 linkedBlockHashes:[newBlock.hash]
  //               }
  //               logger(chalk.yellow(`* Added new block fork ${newBlock.hash.substr(0, 25)}...`));
  //               logger(chalk.yellow(`* At block number ${newBlock.blockNumber}...`));
  //               //Store actual block on the chain, as an array
  //               //On the parent block of the fork, called the fork root
  //               this.chain[forkRootBlockNumber][newBlock.hash] = []
  //               this.chain[forkRootBlockNumber][newBlock.hash].push(newBlock)
  //               return true
  //           }

  //           const findFirstBlockInFork = (newestForkedBlock) =>{
  //             let previousForkedBlock = this.blockForks[newestForkedBlock.previousHash]
  //             let blockBeforePrevious = this.blockForks[previousForkedBlock.previousHash]
  //             if(previousForkedBlock.previousHash == previousForkedBlock.root){
  //               return previousForkedBlock
  //             }else if(blockBeforePrevious){
  //               //Possibly dangerous
  //               return findFirstBlockInFork(previousForkedBlock)
  //             }else{
  //               return false
  //             }
  //           }

  //           //Very unstable, needs to be refactored entirely
  //           const extendFork = async (newBlock) =>{
  //             //Build on top of an existing blockchain fork
  //             let existingFork = this.blockForks[newBlock.previousHash]

  //             if(existingFork){
  //               //Checks if new block's previous block hash is the root of the fork
  //               let rootHash = this.blockForks[newBlock.previousHash].root
  //               //Hash of the newest block
  //               let rootIndex = this.getIndexOfBlockHash(rootHash)
                
  //               if(rootIndex){
  //                 let rootBlock = this.chain[rootIndex];
  //                 //Extracts the forked blocks from the block where the split happened
  //                 //By using the previousBlock Hash
                  
  //                 let firstBlockForkedHash = existingFork.linkedBlockHashes[0]
                  
  //                 let fork = rootBlock[firstBlockForkedHash]
                  
  //                 if(fork && Array.isArray(fork)){
  //                   //Build upon the fork if all criterias are met
  //                   fork.push(newBlock)
  //                   //define new entry pointing for the fork, pointing to the previous forked block
  //                   this.blockForks[newBlock.hash] = {
  //                     root:rootBlock.hash,
  //                     previousHash:newBlock.previousHash,
  //                     hash:newBlock.hash,
  //                     linkedBlockHashes:[ ...existingFork.linkedBlockHashes, newBlock.hash ]
  //                   }
  //                   return fork;
  //                 }else{
  //                   //
  //                   console.log('RootHash', rootHash)
  //                   console.log('RootIndex', rootIndex)
  //                   console.log('RootBlock', rootBlock)
  //                   console.log('Newblock hash', newBlock.hash)
  //                   console.log('Newblock previous', newBlock.previousHash)
  //                   console.log('Block forks', this.blockForks)
  //                   console.log('Fork type', typeof fork)
  //                   console.log('Fork', fork)
  //                   logger('ERROR: Fork is not an array')
  //                   return false
  //                 }

  //               }else{
  //                 //In this case, it would be a good idea to create a peer blockchain watcher
  //                 //to follow the progress of mining. When the concurrent chain becomes longer, 
  //                 //it automatically switches to the other branch, without making a fuss

  //                 console.log('RootHash', rootHash)
  //                 console.log('RootIndex', rootIndex)
  //                 console.log('Block forks', this.blockForks)
  //                 console.log('Newblock hash', newBlock.hash)
  //                 console.log('Newblock previous', newBlock.previousHash)
  //                 logger('ERROR: Root is not part of the chain')
  //                 return false
  //               }
  //             }else{
  //               //Is not linked or would need to be added
  //               logger('ERROR: Could not find fork info')
  //               return false
  //             }
  //           }

  //           const resolveFork = (fork) =>{
  //             return new Promise(async (resolve)=>{
  //               if(fork && Array.isArray(fork)){

  //                 let numberOfBlocks = fork.length;
  //                 let lastBlock = fork[fork.length - 1]
  //                 let forkTotalDifficulty = BigInt(parseInt(lastBlock.totalDifficulty, 16))
  //                 let currentTotalDifficulty = BigInt(parseInt(this.getLatestBlock().totalDifficulty, 16))
  //                 let forkChainHasMoreWork =  forkTotalDifficulty > currentTotalDifficulty
                  
  //                 if(forkChainHasMoreWork){

  //                   this.isSyncingBlocks = true

  //                   let isValidTotalDifficulty = this.calculateWorkDone(fork)
  //                   if(isValidTotalDifficulty){
  //                     let forkHeadBlock = fork[0];
  //                     let rolledBackBlocks = await this.rollbackToBlock(forkHeadBlock.blockNumber - 1)
  //                     if( rolledBackBlocks){
  //                       if( rolledBackBlocks.error) resolve({error: rolledBackBlocks.error})
  //                       else{
  //                         //Here we recreate new blockFork entries so that if a block is to be mined on top of it
  //                         //It is still possible to revert back to this branch
  //                         //In fact, the chain is not entirely rolledback, as the removed blocks will be placed 
  //                         //as a fork of the new branch
                          
  //                         this.chainSyncs = {
  //                           blockNumber:forkHeadBlock.blockNumber,
  //                           hash:forkHeadBlock.hash,
  //                           previousHash:forkHeadBlock.previousHash,
  //                           forkLength:fork.length
  //                         }

  //                         this.blockForks = {}
  //                         if(!Array.isArray(rolledBackBlocks)){
  //                           rolledBackBlocks = [rolledBackBlocks]
  //                         }
  //                         if(rolledBackBlocks.length > 0){
  //                           //Convert a single rolled back block to an array to facilitate handling
                            
  //                           //Get the first block of the removed block to place as a fork in the new head block of the chain
  //                           let firstBlockHeaderRemoved = rolledBackBlocks[0]
                            
  //                           let firstBlockRemoved = await this.getBlockFromDB(firstBlockHeaderRemoved.blockNumber)
  //                           let newLatestBlock = this.getLatestBlock()
  //                           let newChainBranch = []
  //                           let hashesOfRemovedBlock = []

  //                           for await(let header of rolledBackBlocks){
  //                             let block = await this.getBlockFromDB(header.blockNumber)
  //                             newChainBranch.push(block)
  //                             hashesOfRemovedBlock.push(block.hash)
  //                             this.blockForks[block.hash] = {
  //                               root:newLatestBlock.hash,
  //                               previousHash:block.previousHash,
  //                               hash:block.hash,
  //                               linkedBlockHashes:[ ...hashesOfRemovedBlock ]
  //                             }

  //                           }

  //                           newLatestBlock[firstBlockRemoved.hash] = newChainBranch
  //                         }

  //                         for await(var forkBlock of fork){
  //                           let index = fork.indexOf(forkBlock)
  //                           console.log('Index of block in fork', index)
  //                           console.log('Forked block hash', forkBlock.hash)
  //                           console.log('Forked previous hash', forkBlock.previousHash)
  //                           let isValidBlock = await this.validateBlock(forkBlock);
  //                           if(isValidBlock){
  //                             var isLinked = forkBlock.previousHash == this.chain[forkBlock.blockNumber - 1].hash || (index > 0 ? forkBlock.previousHash == fork[index - 1] : false)
  //                             if(isLinked){
  //                               let newHeader = this.extractHeader(forkBlock)
  //                               let executed = await this.balance.runBlock(forkBlock)
  //                               if(executed.error) resolve({error:executed.error})
                                
  //                               let saved = await this.balance.saveBalances(newBlock)
  //                               if(saved.error) resolve({error:saved.error})

  //                               let actions = forkBlock.actions || {}
  //                               let allActionsExecuted = await this.executeActionBlock(actions)
  //                               if(allActionsExecuted.error) resolve({error:allActionsExecuted.error}) 
                                
  //                               let actionsDeleted = await this.mempool.deleteActionsFromMinedBlock(actions)
  //                               if(!actionsDeleted) resolve({error:'ERROR: Could not delete actions from Mempool'}) 
                                
  //                               let callsExecuted = await this.runTransactionCalls(newBlock);
  //                               if(callsExecuted.error) resolve({error:callsExecuted.error})
                                
  //                               let transactionsDeleted = await this.mempool.deleteTransactionsFromMinedBlock(newBlock.transactions)
  //                               if(!transactionsDeleted) resolve({error:'ERROR: Could not delete transactions from Mempool' })

  //                               this.spentTransactionHashes.push(...newHeader.txHashes)
  //                               this.chain.push(newHeader);
  //                               let added = await this.addBlockToDB(newBlock)
  //                               if(added){
  //                                 if(added.error) resolve({error:added.error})

                                  
  //                                 let statesSaved = await this.contractTable.saveStates()
  //                                 if(statesSaved.error) console.log('State saving error', statesSaved.error)
                                  
  //                                 let saved = await this.saveLastKnownBlockToDB()
  //                                 if(saved.error) console.log('Saved last block', saved)
                                  
  //                                 this.isBusy = false
  //                                 resolve(true);
                                  
  //                               }else{

  //                                 this.isBusy = false
  //                                 resolve({ error:'Could not push new block' })
  //                               }
              
  //                             }else{
  //                               console.log(`Block hash ${forkBlock.hash.substr(0,25)}  is not linked`)
  //                               console.log('Block hash', forkBlock.hash)
  //                               console.log('Previous hash', forkBlock.previousHash)
  //                             }
  //                           }else{
  //                             console.log(`Block hash ${forkBlock.hash.substr(0,25)}  is not valid ${isValidBlock}`)
  //                           }
  //                           // let pushed = await this.pushBlock(forkBlock)
  //                           // if(pushed.error) resolve({ error:pushed.error })
                            
  //                         }
  //                         logger(chalk.yellow(`* Synced ${fork.length} blocks from forked branch`))
  //                         this.isSyncingBlocks = false;
                          
  //                         resolve(true)
  //                       }
  //                     }
  //                   }else{
  //                     logger('Is not valid total difficulty')
  //                     resolve({error:'Is not valid total difficulty'})
  //                   }
  //                 }else{
  //                   resolve(false)
  //                 }
                  
  //               }else{
  //                 resolve({error:'Fork provided is not an array'})
  //               }
  //             })

  //           }
              
  //           if(forkRootBlockNumber){
  //             if(this.blockForks[newBlock.previousHash]){
  //               resolve({ error:'Could not create fork. Block linked to block fork and chain' })
  //             }else{
  //               //This is the first block of the fork
  //               let added = addNewFork(newBlock)
  //               resolve(added)
  //             }
  //           }else{
  //             if(this.blockForks[newBlock.previousHash]){
  //               let extendedFork = await extendFork(newBlock)
  //               if(extendedFork){
  //                 let resolved = await resolveFork(extendedFork)
  //                 if(resolved.error){
  //                   resolve({error:resolved.error})
  //                 }else if(resolved){
  //                   logger(chalk.yellow(`* Synced ${fork.length} blocks from forked branch`))
  //                   logger(chalk.yellow(`* Finished syncing blockchain fork`))
  //                   logger(chalk.yellow(`* Now working on head block ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
  //                   resolve({ syncing:true })
  //                 }else{
  //                   logger(chalk.yellow(`* Staying on main blockchain`))
  //                   logger(chalk.yellow(`* Head block is ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
  //                   resolve({ staying:true })
  //                 }
  //               }else{
  //                 resolve({ error:'Could not extend fork' })
  //               }
  //             }else{
  //               resolve({ error:'Could not create fork. Block is not linked' })
  //             }
  //           } 
            
  //         }
  //     }
  //   })
  // }
  async createNewBranch(newBlock){
    let alreadyExists = this.branches[newBlock.hash]
    if(!alreadyExists){
      this.branches[newBlock.hash] = [ newBlock ]
      return { added:true }
    }else{
      return false
    }
  }

  async branchContainsBlockNumber(newBlock, branch){
    for await(let block of branch){
      if(block.blockNumber == newBlock.blockNumber){
        return true
      }
    }

    return false
  }

  async extendBranch(newBlock){
    let existingBranch = this.branches[newBlock.previousHash]
    if(existingBranch){
      
      let chainContainsBlockNumber = await this.branchContainsBlockNumber(newBlock, existingBranch)
      if(!chainContainsBlockNumber){
        let branch = [ ...existingBranch, newBlock ]
        this.branches[newBlock.hash] = branch
        
        let readyToSwitchToBranch = await this.switchToBranch(newBlock, branch)
        if(readyToSwitchToBranch.switched){
          return { switched:true }
        }else if(readyToSwitchToBranch.extended){
          return { extended:true }
        }else if(readyToSwitchToBranch.outOfSync){
          return { outOfSync:true }
        }else if(readyToSwitchToBranch.error){
          return { error:readyToSwitchToBranch.error }
        }else{
          return false
        }
      }else{
        return false
      }
      
    }else{
      return await this.createNewBranch(newBlock)
    }
  }

  async validateBranch(newBlock, branch){
        // let branchingBlock = this.chain[branch[0].blockNumber]
        // let totalDifficultyAtBranch = branchingBlock.totalDifficulty
        // let recalculatedTotalDifficulty = await this.calculateTotalDifficulty(branch)
        // let sumOfDifficulties = (BigInt(parseInt(totalDifficultyAtBranch, 16)) + BigInt(parseInt(recalculatedTotalDifficulty, 16))).toString(16) 
        // let isValidTotalDifficulty = true //sumOfDifficulties === newBlock.totalDifficulty
        

        let forkTotalDifficulty = BigInt(parseInt(newBlock.totalDifficulty, 16))
        let currentTotalDifficulty = BigInt(parseInt(this.getLatestBlock().totalDifficulty, 16))

        let currentBranchHasMoreWork = (forkTotalDifficulty > currentTotalDifficulty)
        let branchIsLongEnough = branch.length >= 3
        let peerBlockchainIsLonger = newBlock.blockNumber > this.getLatestBlock().blockNumber
        

        if(branchIsLongEnough && currentBranchHasMoreWork && peerBlockchainIsLonger){
          return true
        }else if(!currentBranchHasMoreWork && branchIsLongEnough && peerBlockchainIsLonger){
          return true
        }else if(!branchIsLongEnough && currentBranchHasMoreWork && peerBlockchainIsLonger){
          return true
        }else if(!peerBlockchainIsLonger && branchIsLongEnough && currentBranchHasMoreWork){
          return true
        }else{
          console.log('More work', currentBranchHasMoreWork)
          console.log('Branch length okay', branchIsLongEnough)
          console.log('Blockchain is longer', peerBlockchainIsLonger)
          console.log('Branch', branch.length)
          return false
        }

  }

  async switchToBranch(newBlock, branch){
    //Do the branching block respect two out of the three rules to proceed with the switching
    //of blockchain branches?
    let isValidBranchToSwap = await this.validateBranch(newBlock, branch)
    if(isValidBranchToSwap){
      let firstBlockOfBranch = branch[0]
      //Is the branch linked to current blockchain?
      let isLinkedToBlockNumber = await this.getBlockNumberOfHash(firstBlockOfBranch.previousHash)
      if(!isLinkedToBlockNumber) {
        //If it is not linked, proceed to find the missing  
        //By adding the branch here, we may look for the missing block, then, when found, we can add it back in and connect
        //possibly two branches or connect the branch to the chain
        this.unlinkedBranches[firstBlockOfBranch.previousHash] = branch
        return { outOfSync:firstBlockOfBranch.previousHash }
      }else{
        //If it is linked, rollback to the block before the split and merge the branched blocks, one by one
        let rolledback = await this.rollbackToSyncBranch(isLinkedToBlockNumber)
        if(rolledback){
          if(rolledback.error) return { error:rolledback.error }

          let previousBlock = {}
          for await(let block of branch){
            if(block.hash !== firstBlockOfBranch.hash && previousBlock.hash !== block.previousHash){
              console.log(`ERROR: Block ${block.blockNumber} is not linked to previous block`)
              console.log('Previous:', previousBlock)
              console.log('Current:', block)
              
            }else{
              let isValidBlock = await this.validateBlock(newBlock)
              if(isValidBlock){
                let synced = await this.addBlockToChain(block)
                if(synced.error) return { error:synced.error }

                previousBlock = block;
              }else{
                console.log(`ERROR: Block ${block.blockNumber} is invalid: ${isValidBlock}`)
              }
            }
            
          }

          return { switched:true }
        }else{
          return { error:`ERROR: Could not rollback to block ${firstBlockOfBranch.blockNumber - 1}. Latest block is that height` }
        }
      }
    }else{
      return { extended:true }
    }
  }

  async rollbackToSyncBranch(blockNumber){
    let isPartOfChain = this.chain[blockNumber]
    let isLastBlock = this.getLatestBlock().blockNumber == blockNumber
    if(isPartOfChain){
      let rolledback = await this.rollbackToBlock(blockNumber)
        if(rolledback.error) return { error:rolledback.error }
        else{
          return true
        }
    }else{
      return { error:`ERROR: Could not rollback to block ${blockNumber}. Out of bound` }
    }
  }

  async blockchainBranches(newBlock){


    let newBlockHasBeenBranched = await this.extendBranch(newBlock)
    if(newBlockHasBeenBranched.error) return { error:newBlockHasBeenBranched.error }
    else if(newBlockHasBeenBranched) return newBlockHasBeenBranched
    else{
      return { error:`ERROR: Could not add ${newBlock.blockNumber} to branch` }
    }
    

  }


  // async createChainBranch(newBlock){

  //   const attemptToMergeBranch = async (branch) =>{
  //     let blockNumberOfSplit = branch[0].blockNumber
      
  //     if(blockNumberOfSplit > this.getLatestBlock().blockNumber){
  //       return { outOfSync:true }
  //     }else{
  //       let latestBlockHash = this.getLatestBlock().hash
  //       let removedBranchFromTrunk = this.chain.slice(blockNumberOfSplit - 1,  newBlock.blockNumber)
  //       if(removedBranchFromTrunk && !Array.isArray(removedBranchFromTrunk)) removedBranchFromTrunk = [ removedBranchFromTrunk ]
  //       this.branches[latestBlockHash] = removedBranchFromTrunk
        
  //       let rolledBack = await this.rollbackToBlock(blockNumberOfSplit - 1)
  //       if(rolledBack.error) return { error:rolledBack.error }

  //       let isBranchConnectedToChain = this.getBlockFromHash(branch[0].previousHash)

  //       if(isBranchConnectedToChain){
  //         for await(let block of branch){
  //           let alreadyExists = await this.getBlockFromHash(block.hash)
  //           if(!alreadyExists){
  //             let added = await this.addBlockToChain(block)
  //             if(added.error) return { error:added.error }
  //           }
            
  //         }
  //         return { synced:true }
  //       }else{
  //         //Weirdest case here
  //         return { outOfSync:true }
  //       }
  //     }
  
  //   }

  //   if(newBlock){
  //     let isPartOfOtherBranch = this.branches[newBlock.previousHash]
  //     if(isPartOfOtherBranch){

  //       let branch = this.branches[newBlock.previousHash]
  //       for await(let block of branch){
  //         if(block.blockNumber == newBlock.blockNumber){
  //           return { error:'ERROR: Could not add block to branch. Already contains block of that height' }
  //         }
  //       }
  //       branch.push(newBlock)

  //       let blockNumberOfSplit = branch[0].blockNumber
  //       let branchingBlock = this.chain[blockNumberOfSplit - 1]
        
  //       if(branchingBlock){
          
  //         let totalDifficultyAtBranch = branchingBlock.totalDifficulty
  //         let recalculatedTotalDifficulty = await this.calculateTotalDifficulty([ ...branch, newBlock ])
  //         let sumOfDifficulties = (BigInt(parseInt(totalDifficultyAtBranch, 16)) + BigInt(parseInt(recalculatedTotalDifficulty, 16))).toString(16) 
  //         let isValidTotalDifficulty = true //sumOfDifficulties === newBlock.totalDifficulty
  //         if(isValidTotalDifficulty){
  
  //           let forkTotalDifficulty = BigInt(parseInt(newBlock.totalDifficulty, 16))
  //           let currentTotalDifficulty = BigInt(parseInt(this.getLatestBlock().totalDifficulty, 16))
  
  //           this.branches[newBlock.hash] = [ ...branch, newBlock ]
  //           // delete this.branches[newBlock.previousHash]

  //           if(forkTotalDifficulty > currentTotalDifficulty && branch.length >= 3){
              
  //             let mergedBranch = await attemptToMergeBranch(this.branches[newBlock.hash])
  //             if(mergedBranch.error) return { error:mergedBranch.error }
  //             else if(mergedBranch.outOfSync){
  //               return { outOfSync:true }
  //             }else{
  //               return { synced:true }
  //             }
              
  //           }else{
  //             return { staying:true }
  //           }
  //         }else{
  //           return { error:'ERROR: Recalculated total difficulty does not match new block total difficulty' }
  //         }
  //       }else{
  //         return { outOfSync:true }
  //       }

  //     }else{
  //       this.branches[newBlock.hash] = [ newBlock ]
  //       return { branched:true }
  //     }
  //   }else{
  //     return { error:'ERROR: New block to branch is undefined' }
  //   }
  // }

  putHeaderToDB(block){
    return new Promise(async (resolve)=>{

        let put = await this.chainDB.add({
            _id:block.blockNumber.toString(),
            [block.blockNumber]:this.extractHeader(block)
        })

        if(put.error) resolve({error:put.error})

        resolve(put)
        
    })
  }

  putBodyToDB(block){
    return new Promise(async (resolve)=>{
      
        if(block.actions && Object.keys(block.actions).length > 0){
            block.transactions['actions'] = block.actions
        }
        
        let put = await this.chainDB.add({
            _id:block.hash,
            [block.hash]:block.transactions
        })
        if(put.error) resolve({error:put.error})
        resolve(put)
    })
  }

  getLastKnownBlockFromDB(){
    return new Promise(async (resolve)=>{
        let lastBlockEntry = await this.chainDB.get('lastBlock')
        if(lastBlockEntry && Object.keys(lastBlockEntry).length > 0){
            if(lastBlockEntry.error) resolve({error:lastBlockEntry.error})
            let lastBlock = lastBlockEntry[lastBlockEntry._id]
            if(lastBlock){
              resolve(lastBlock)
            }else{
              if(this.chain.length > 0){
                resolve(this.chain[0])
              }else{
                resolve({blockNumber:0})
              }
            }

            
        }else{
          
          if(this.chain.length > 0){
            resolve(this.chain[0])
          }else{
            resolve({blockNumber:0})
          }
        }
    })
  }

  saveLastKnownBlockToDB(){
    return new Promise(async (resolve)=>{
        let saved = await this.chainDB.add({
          _id:'lastBlock',
          'lastBlock':this.getLatestBlock()
        })
        if(saved.error) resolve({error:saved})
        else resolve(saved)
      // let lastBlock =  await this.getLastKnownBlockFromDB()
      // if(lastBlock){
      //     if(lastBlock.error) resolve({error:lastBlock.error})
      //     let latestBlockInMemory = this.getLatestBlock()
      //     if(latestBlockInMemory.blockNumber <= lastBlock.blockNumber){
      //       console.log('Is equal')
      //       let saved = await this.chainDB.put({
      //         id:'lastBlock',
      //         key:'lastBlock',
      //         value:lastBlock
      //       })
      //       if(saved.error) resolve({error:saved})
      //       else resolve(saved)
      //     }else{
      //       let saved = await this.chainDB.put({
      //         id:'lastBlock',
      //         key:'lastBlock',
      //         value:latestBlockInMemory
      //       })
      //       if(saved.error) resolve({error:saved})
      //       else resolve(saved)
      //     }
          
      // }else{
        

      // }

    })
  }

  addBlockToDB(block){
    return new Promise(async (resolve)=>{
      
      let put = await this.chainDB.add({
          _id:block.blockNumber.toString(),
          [block.blockNumber]:block
      })

      if(put.error) resolve({error:put.error})
      resolve(put)

    })
  }

  getBlockFromDB(blockNumber){
    return new Promise(async (resolve)=>{
      
      let blockEntry = await this.chainDB.get(blockNumber.toString())
      if(blockEntry){
        
        if(blockEntry .error) resolve({error:blockEntry .error})
        let block = blockEntry[blockEntry._id]
        resolve(block)
      }else{
        resolve(false)
      }
    })
  }


  putBlockToDB(block){
    return new Promise(async (resolve)=>{
      if(!block){
        console.log('ERROR: Need to pass valid block')
        resolve(false)
      
      }
      
      let existingBlock = await this.fetchBlockFromDB(block.blockNumber)
      if(existingBlock){
        let deleted = await this.removeBlockFromDB(existingBlock)
        if(deleted){
          let headerAdded = await this.putHeaderToDB(block);
          if(headerAdded){
            let bodyAdded = await this.putBodyToDB(block);
            resolve(bodyAdded)
          }else{
            resolve(false)
          }
        }else{
          resolve(false)
        }
      }else{
        let headerAdded = await this.putHeaderToDB(block);
        if(headerAdded){
          let bodyAdded = await this.putBodyToDB(block);
          resolve(bodyAdded)
        }else{
          resolve(false)
        }
      }
      
    })
  }

  getHeaderFromDB(blockNumber){
    return new Promise(async (resolve)=>{
      if(blockNumber){
          let headerEntry = await this.chainDB.get(blockNumber.toString())
          if(headerEntry){
              if(headerEntry.error) resolve({error:headerEntry.error})
              let header = headerEntry[headerEntry._id]
              resolve(header)
          }else{
              resolve(false)
          }
      }else{
        resolve(false)
      }
    })
  }

  getBodyFromDB(hash){
    return new Promise(async (resolve)=>{
      if(hash){
        let header = this.getBlockFromHash(hash)
        let bodyEntry = await this.chainDB.get(hash)
        if(bodyEntry){
            if(bodyEntry.error) resolve({error:bodyEntry.error})
            let body = bodyEntry[bodyEntry._id]
            resolve(body) 
        }else{
            resolve(false)
        }
      }else{
          resolve({error:'ERROR: To fetch block body a valid block hash is required'})
      }
    })
  }

  fetchBlockFromDB(blockNumber){
    return new Promise(async (resolve)=>{
      if(typeof blockNumber == 'number') blockNumber = blockNumber.toString()
      let block = await this.getHeaderFromDB(blockNumber)
      if(block){
        if(block.error) resolve({error:block.error})
        let blockBody = await this.getBodyFromDB(block.hash)
        if(blockBody){
          if(blockBody.error) resolve({error:blockBody.error})
          
          block.transactions = blockBody

          if(blockBody.actions){
            block.actions = JSON.parse(JSON.stringify(blockBody.actions))
            delete blockBody.actions
            resolve(block)
          }else{
            resolve(block)
          }
        }else{
          console.log('ERROR Could not get block body')
          resolve(false)
        }
      }else{
        console.log('ERROR Could not get block header')
        resolve(false)
      }
    })
  }

  getBlockTransactions(hash){
      return new Promise((resolve)=>{
          let block = this.getBodyFromDB(hash);
          if(block){
              if(block.error) resolve({error:block.error})

              let transactions = block[block.hash]
              if(transactions.actions){
                  delete transactions.actions
              }

              resolve(transactions)
          }else{
              resolve(false)
          }
      })
  }

  getBlockActions(hash){
    return new Promise((resolve)=>{
        let block = this.getBodyFromDB(hash);
        if(block){
            if(block.error) resolve({error:block.error})

            let transactions = block[block.hash]
            if(transactions.actions){
                resolve(transactions.actions)
            }else{
                resolve(false)
            }
        }else{
            resolve(false)
        }
    })
}

  getTransactionFromDB(hash){
    return new Promise(async (resolve)=>{
      let transaction = {}
      for await(var block of this.chain){
        if(block.blockNumber > 0 ){
          if(block.txHashes){
            
            if(block.txHashes.includes(hash)){
              
              let body = await this.getBlockFromDB(block.blockNumber)
              if(body){
                transaction = body.transactions[hash];
              }else{
                resolve({error:`Found transaction in block ${block.blockNumber} but could not fetch its content`})
              }
            }
          }else{
            resolve({error:`Block ${block.blockNumber} has not transaction hashes`})
          }
        }

      }

      resolve(transaction)
    })
  }

  getActionFromDB(hash){
    return new Promise(async (resolve)=>{
      let lastBlock = this.getLatestBlock()
      let found = false;
      for await(var block of this.chain){
        if(block.actionHashes){
          if(block.actionHashes.includes(hash)){
            let body = await this.getBlockFromDB(block.blockNumber)
            if(body){
              if(body.actions){
                let action = body.actions[hash];
                found = true
                resolve(action)
              }else{
                logger(`Body of block ${block.blockNumber} does not contain actions even though it should`)
                resolve(false)
              }
            }else{
              logger(`Body of block ${block.blockNumber} does not exist`)
              resolve(false)
            }
          }else{
            if(lastBlock.blockNumber == block.blockNumber && !found){
              logger('Could not find anything for hash', hash)
              resolve(false)
            }
          }
        }else{
          if(lastBlock.blockNumber == block.blockNumber && !found){
            logger('Could not find anything for hash', hash)
            resolve(false)
          }
        }
        
      }
    })
  }
  

  removeHeaderFromDB(blockNumber){
    return new Promise(async (resolve)=>{
      let headerExists = await this.chainDB.get(blockNumber.toString())
      if(headerExists){
          if(headerExists.error) resolve({error:headerExists.error})

          let deleted = await this.chainDB.delete(blockNumber.toString())
          if(deleted.error) resolve({error:deleted.error})

          resolve(deleted)
      }else{
          resolve(false)
      }
      
    })
  }

  removeBodyFromDB(hash){
    return new Promise(async (resolve)=>{
        let bodyExists = await this.chainDB.get(hash)
        if(bodyExists){
            if(bodyExists.error) resolve({error:bodyExists.error})

            let deleted = await this.chainDB.delete(hash)
            if(deleted.error) resolve({error:deleted.error})

            resolve(deleted)
        }else{
            resolve(false)
        }
    })
  }

  removeBlockFromDB(block){
    return new Promise(async (resolve)=>{
      
        let headerDeleted = await this.removeHeaderFromDB(block.blockNumber)
        if(headerDeleted){
            if(headerDeleted.error) resolve({error:headerDeleted.error})
            let bodyDeleted = await this.removeHeaderFromDB(block.hash)
            if(bodyDeleted){
                if(bodyDeleted.error) resolve({error:bodyDeleted.error})
                resolve(bodyDeleted)
            }
        }else{
            resolve(false)
        }
        
    })
  }

  replaceBlockFromDB(newBlock){
    return new Promise(async (resolve)=>{
        let existingBlock = await this.fetchBlockFromDB(newBlock.blockNumber.toString())
        if(existingBlock){
            if(existingBlock.error) resolve({error:existingBlock.error})
            let deleted = await this.removeBlockFromDB(existingBlock)
            if(deleted){
                if(deleted.error) resolve({error:deleted.error})
                let added = await this.putBlockToDB(newBlock)
            if(added){
                if(added.error) resolve({error:added.error})
                resolve(added)
            }else{
                logger('An error occurred while putting block to DB')
                resolve(false)
            }
            }else{
            logger('ERROR: Could not delete block to be replaced from DB')
            resolve(false)
            }
        }else{
            resolve(false)
        }
    })
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

 /**
  * Calculates the total work done on the blockchain by adding all block
  * difficulties, parsed to BigInt from hex
  * @param {Blockchain} chain 
  * @return {string} Total difficulty of given blockchain, expressed as a hex string
  */
  calculateWorkDone(chain=this.chain){
    let total = 0n;
    chain.forEach( block=>{
      let difficulty = BigInt(parseInt(block.difficulty, 16))
      total += difficulty;
    })

    return total.toString(16);
  }

  /***
   * Calculates the total work done on the blockchain by adding all block
  * difficulties, parsed to BigInt from hex
  * @param {Blockchain} chain 
  * @return {string} Total difficulty of given blockchain, expressed as a hex string 
   */

  async calculateTotalDifficulty(chain=this.chain){
     let total = 0n;
     for await(let block of chain){
       let parseDifficulty = parseInt(block.difficulty, 16)
      let difficulty = BigInt(parseDifficulty)
      total += difficulty;
     }

     return total.toString(16)
   }

  /**
   * 
  * @param {object} transaction Unvalidated transaction object 
  * @return {boolean} Validity of transaction, or error object
  */
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

  async chainHasBlockOfHash(hash){
    for await(let header of this.chain){
      if(header.hash == hash){
        return true
      }
    }

    return false
  }

  async getIndexOfBlockHashInChain(hash){
    for await(let header of this.chain){
      if(header.hash == hash){
        return header.blockNumber
      }
    }

    return false
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

  async getBlockNumberOfHash(hash){
    for await(let block of this.chain){
      if(block.hash == hash){
        return block.blockNumber
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



  checkBalance(publicKey){
    let walletState = this.balance.getBalance(publicKey)
    if(walletState){
      return walletState.balance;
    }else{
      return 0
    }
    
  }

  gatherMiningFees(transactions, actions){
    return new Promise((resolve)=>{
      if(transactions){
        let reward = 0;
        var txHashes = Object.keys(transactions);
        for(var hash of txHashes){
            reward += transactions[hash].miningFee;
        }
  
        if(actions){
          var actionHashes = Object.keys(transactions);
          for(var hash of actionHashes){
              reward += actions[hash].fee;
          }
        }
        resolve(reward)
      }else{
        resolve(false)
      }
    })

  }

  

  getMiningFees(block){
      return new Promise(async(resolve)=>{
        if(block){
            let reward = 0;
            let transactions = await this.getBlockTransactions(block.hash)
            if(transactions){
                if(transaction.error) resolve({error:transaction.error})
                transactions = transactions[transactions._id]
                var txHashes = Object.keys(transactions);
                var actionHashes = Object.keys(transactions.actions);
                
                for await(var hash of txHashes){
                    reward += transactions[hash].miningFee;
                }
        
                for await(var hash of actionHashes){
                    reward += transactions.actions[hash].fee;
                }
        
                resolve(reward)
            }else{
                resolve({error:`ERROR: Could not get mining fee, block ${block.hash} does not exist`})
            }
            
          }
      })

  }

  async calculateTotalMiningRewards(){
    let amountOfReward = 0;
    for await(let block of this.chain){
      let transactions = await this.getBlockTransactions(block.hash)
        if(transactions){
          if(transactions.error) return { error:transactions.error }
        }else{
          
          transactions = transactions[transactions._id]
          let txHashes = Object.keys(transactions);
          txHashes.forEach( hash =>{
            let tx = transactions[hash];
            if(tx.fromAddress == 'coinbase'){
              amountOfReward += tx.amount;
            }
          })
        }
    }

    return amountOfReward;
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
          let transactions = await this.getBlockTransactions(block.hash)
          if(transactions){
            if(transactions.error) return {error:transactions.error}
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
          }else{
              return {error:`ERROR: Could not get transaction history. Block ${block.hash} not found`}
          }
          
        }

      return history;
    }

  }

  async getTransactionFromChain(hash){
    let tx = {}
    if(hash){
      for await(let block of this.chain){
        let transactions = await this.getBlockTransactions(block.hash)
        if(transactions){
            if(transactions.error) return {error:transactions.error}
            transactions = transactions[transactions._id]
            if(block.transactions[hash]){
                //need to avoid collision
                tx = block.transactions[hash];
                return tx;
            }
        }else{
            return {error:`ERROR: Could not find transaction ${hash}. \nBlock ${block.hash} not found`}
        }
        
      }

      return false
      
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

  async getMedianBlockTimestamp(numBlocks){
    let currentBlockNumber = this.getLatestBlock().blockNumber
    let pastBlocks = this.chain.slice(currentBlockNumber - numBlocks, currentBlockNumber)
    let timestampSum = 0
    for await(let block of pastBlocks){
      timestampSum += block.timestamp
    }

    return timestampSum / numBlocks
  }

  async validateBlockTimestamp(block){
    let medianBlockTimestamp = 0
    if(this.chain.length > 10){
      medianBlockTimestamp = await this.getMedianBlockTimestamp(10)
    }else if(this.chain.length > 2){
      medianBlockTimestamp = await this.getMedianBlockTimestamp(this.chain.length - 1)
    }else{
      medianBlockTimestamp = this.chain[0].timestamp
    }

    
    let timestamp = block.timestamp;
    let twentyMinutesInTheFuture = 30 * 60 * 1000
    let previousBlock = this.chain[block.blockNumber - 1] || this.getLatestBlock()
    let previousTimestamp = previousBlock.timestamp
    if(timestamp > previousTimestamp && timestamp < (Date.now() + twentyMinutesInTheFuture) ){
      if(block.timestamp < medianBlockTimestamp) return false
      else return true
    }else{
      return false
    }
    
  }

  validateDifficulty(block){
    let previousBlock = this.chain[block.blockNumber - 1]
    if(previousBlock){
      
      let difficultyRecalculated = this.difficulty.setNewDifficulty(previousBlock, block);
      let parsedRecalculatedDifficulty = BigInt(parseInt(difficultyRecalculated, 16))
      let parsedActualdifficulty = BigInt(parseInt(block.difficulty, 16))
      if(parsedActualdifficulty == parsedRecalculatedDifficulty){
        return true;
      }else{
        console.log('Difficulty recalculated: ', difficultyRecalculated)
        console.log('Block difficulty: ', block.difficulty)
        console.log('Previous Block', previousBlock)
        return false;
      }
    }
  }

  validateChallenge(block){
    let recalculatedChallenge = this.difficulty.setNewChallenge(block)
    let parsedRecalculatedChallenge = BigInt(parseInt(recalculatedChallenge, 16))
    let parsedActualChallenge = BigInt(parseInt(block.challenge, 16))
    if(parsedActualChallenge == parsedRecalculatedChallenge){
      return true
    }else{
      return false
    }
  }

  validateUniqueCoinbaseTx(block){
    return new Promise((resolve)=>{
      let transactionHashes = Object.keys(block.transactions);
      let coinbase = false
      for(var hash of transactionHashes){
        let tx = block.transactions[hash]
        if(tx.fromAddress == 'coinbase'){
          if(!coinbase){
            coinbase = tx;
          }else{
            resolve(false)
          }
        }
      }

      resolve(true)
    })
  }

  async validateEntireBlockchain(){
    logger('Validating the entire blockchain')
    for await(let header of this.chain){
      if(header.blockNumber > 0){
        logger('Validating block '+header.blockNumber)
        let block = await this.fetchBlockFromDB(header.blockNumber.toString())
        
        let isValidBlock = await this.isValidBlock(block)
        if(!isValidBlock) return { error: `Block number ${block.blockNumber} is not valid` }
      }
    }

    return true
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
      // console.log(block)
      var chainAlreadyContainsBlock = this.checkIfChainHasHash(block.hash);
      var isValidHash = block.hash == RecalculateHash(block);
      var isValidTimestamp = await this.validateBlockTimestamp(block)
      var hasOnlyOneCoinbaseTx = await this.validateUniqueCoinbaseTx(block)
      var isValidChallenge = this.validateChallenge(block);
      var areTransactionsValid = this.validateBlockTransactions(block)
      var merkleRootIsValid = await this.isValidMerkleRoot(block.merkleRoot, block.transactions);
      var hashIsBelowChallenge = BigInt(parseInt(block.hash, 16)) <= BigInt(parseInt(block.challenge, 16))
      //validate difficulty
      var difficultyIsAboveMinimum = BigInt(parseInt(block.difficulty, 16)) >= BigInt(parseInt(this.chain[0].difficulty, 16))

      if(!difficultyIsAboveMinimum) resolve({error:'ERROR: Difficulty level must be above minimum set in genesis block'})
      // if(!isValidTimestamp) resolve({error:'ERROR: Is not valid timestamp'})
      if(!hashIsBelowChallenge) resolve({error:'ERROR: Hash value must be below challenge value'})
      if(!hasOnlyOneCoinbaseTx) resolve({error:'ERROR: Block must contain only one coinbase transaction'})
      if(areTransactionsValid.error) resolve({error:areTransactionsValid.error})
      if(!isValidChallenge) resolve({error:'ERROR: Recalculated challenge did not match block challenge'})
      if(!merkleRootIsValid) resolve({error:'ERROR: Merkle root of block IS NOT valid'})
      if(!isValidHash) resolve({error:'ERROR: Is not valid block hash'})
      if(chainAlreadyContainsBlock) resolve({error:'ERROR: Chain already contains block'})
      
      // if(!isValidDifficulty){
      //   logger('ERROR: Recalculated difficulty did not match block difficulty')
      // }
      

      // if(!timestampIsGreaterThanPrevious){
      //   logger('ERROR: Block Timestamp must be greater than previous timestamp ')
      //   resolve(false)
      // }
      
      resolve(true)
    })
    
  }

  async isValidBlock(block){
    // console.log(block)
    var chainAlreadyContainsBlock = this.checkIfChainHasHash(block.hash);
    var isValidHash = block.hash == RecalculateHash(block);
    var isValidTimestamp = await this.validateBlockTimestamp(block)
    var hasOnlyOneCoinbaseTx = await this.validateUniqueCoinbaseTx(block)
    var isValidChallenge = this.validateChallenge(block);
    var areTransactionsValid = await this.validateBlockTransactions(block)
    var merkleRootIsValid = false;
    var hashIsBelowChallenge = BigInt(parseInt(block.hash, 16)) <= BigInt(parseInt(block.challenge, 16))
    //validate difficulty
    var difficultyIsAboveMinimum = BigInt(parseInt(block.difficulty, 16)) >= BigInt(parseInt(this.chain[0].difficulty, 16))

    if(!difficultyIsAboveMinimum){
      return { error: 'ERROR: Difficulty level must be above minimum set in genesis block'}
    }

    if(!isValidTimestamp){
      return { error: 'ERROR: Is not valid timestamp'}
      
    }

    if(!hashIsBelowChallenge){
      return { error: 'ERROR: Hash value must be below challenge value'}
      
    }

    if(!hasOnlyOneCoinbaseTx){
      return { error: 'ERROR: Block must contain only one coinbase transaction'}
      
    }

    if(areTransactionsValid.error){
      return { error: 'Block contains invalid transactions: '+ areTransactionsValid.error}
      
    }

    // if(!isValidDifficulty){
    //   logger('ERROR: Recalculated difficulty did not match block difficulty')
    // }

    if(!isValidChallenge){
      return { error: 'ERROR: Recalculated challenge did not match block challenge'}
     
    }

    if(block.transactions){
      merkleRootIsValid = await this.isValidMerkleRoot(block.merkleRoot, block.transactions);
    }else{
      let transactions = await this.getTransactionFromDB(block.hash)
      if(transactions){
        merkleRootIsValid = await this.isValidMerkleRoot(block.merkleRoot, transactions);
      }
    }

    if(!isValidHash){
      return { error: 'ERROR: Is not valid block hash'}
      
    }

    // if(!timestampIsGreaterThanPrevious){
    //   logger('ERROR: Block Timestamp must be greater than previous timestamp ')
    //   resolve(false)
    // }

    if(!merkleRootIsValid){
      return { error: 'ERROR: Merkle root of block IS NOT valid'}
      
    }
  
    
    if(chainAlreadyContainsBlock){
      return { error: 'ERROR: Chain already contains block'}
      
    }
    

    return true
  }

  //Deprecated
  // validateNewBlock(block){
  //   return new Promise(async (resolve, reject)=>{
  //     try{
  //       var containsCurrentBlock = this.checkIfChainHasHash(block.hash);
  //       var isLinked = this.isBlockLinked(block);
  //       var latestBlock = this.getLatestBlock();
  //       var transactionsAreValid = await this.blockContainsOnlyValidTransactions(block);
  //       //Validate transactions using merkle root
  //       if(containsCurrentBlock){
  //         logger('BLOCK SYNC ERROR: Chain already contains that block')
  //         resolve(false)
  //       }

  //       if(transactionsAreValid.error){
  //         logger('New Block contains invalid transactions:', transactionsAreValid.error)
  //         resolve(false)
  //       }

  //       if(!isLinked){
  //         logger('BLOCK SYNC ERROR: Block is not linked with previous block')
  //         resolve(false)
  //       }

  //       resolve(true)
  //     }catch(e){
  //       console.log(e);
  //       resolve(false)
  //     }
  //   })
    
    
  // }

  


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
          totalDifficulty:block.totalDifficulty,
          challenge:block.challenge,
          txHashes:Object.keys(block.transactions),
          minedBy:block.minedBy,
        }

        if(block.actions){
          header.actionHashes = Object.keys(block.actions)
        }

        return header
      }

    }

  }

  extractHeader(block){
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
      txHashes:Object.keys(block.transactions),
      minedBy:block.minedBy,
    }

    if(block.actions){
      header.actionHashes = Object.keys(block.actions)
    }

    return header
  }

  getAllHeaders(){
      try{
        var headers = []
          this.chain.forEach( block => headers.push(this.getBlockHeader(block.blockNumber)) )
          return headers
      }catch(e){
        console.log('GET HEADER ERROR:', e)
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
          this.rollbackToBlock(atBlockNumber-1);
          logger('Rolled back chain up to block number ', atBlockNumber-1)
          return true;
        }else{
          return false;
        }
      }

      return true;
  }


  rollbackToBlock(number){
    return new Promise(async (resolve)=>{

      const collectActionHashes = async (blocks) =>{
        return new Promise(async (resolve)=>{
          let actionHashes = []
          for(var block of blocks){
            if(block.actionHashes){
              actionHashes = [  ...actionHashes, ...block.actionHashes ]
            }else{
              console.log('No action hashes')
            }
          }
          resolve(actionHashes)
        })
      }

      const collectTransactionHashes = async (blocks) =>{
        return new Promise(async (resolve)=>{
          let txHashes = []
          for(var block of blocks){
            if(block.txHashes){
              txHashes = [  ...txHashes, ...block.txHashes ]
            }else{
              console.log('No tx hashes')
            }
          }
          resolve(txHashes)
        })
      }

      let errors = {}
      let totalBlockNumber = this.getLatestBlock().blockNumber
      let newLastBlock = this.chain[number];
      let numberOfBlocksToRemove = totalBlockNumber - number;
      //Getting a copy of the blocks that will later be removed from the chain
      let blocks = this.chain.slice(number + 1, number + 1 + numberOfBlocksToRemove)
      
      
      let rolledBack = await this.balance.rollback(number)
      if(rolledBack.error) resolve({error:rolledBack.error})

      
      
      let newestToOldestBlocks = blocks.reverse()
      let actionHashes = await collectActionHashes(newestToOldestBlocks)
      let txHashes = await collectTransactionHashes(newestToOldestBlocks)

      let stateRolledBack = await this.contractTable.rollback(newLastBlock.hash)
      if(stateRolledBack.error) resolve({error:stateRolledBack.error})

      if(actionHashes.length > 0){
        for await(var hash of actionHashes){
          //Rolling back actions and contracts
          let action = await this.getActionFromDB(hash);
          if(action){
            if(action.type == 'contract'){
              if(action.task == 'deploy'){
                let contractName = action.data.name;
                let deleted = await this.contractTable.removeContract(contractName);
                if(deleted.error) errors[hash] = deleted.error

              }
              
              }else if(action.type == 'account'){
                let account = action.data
                let removed = await this.accountTable.deleteAccount(account.name, account.signature);
                if(removed.error) errors[hash] = removed.error
              }
            
          }
        }
      }

      let backToNormal = newestToOldestBlocks.reverse()
      let startNumber = ( typeof number == 'number' ? number : parseInt(number)  )
      let removed = this.chain.splice(startNumber + 1, numberOfBlocksToRemove)
      logger(`Head block is now ${this.getLatestBlock().hash.substr(0, 25)}`)
      logger('Rolled back to block ', number)
      if(Object.keys(errors).length > 0) resolve({error:errors})
      else resolve(removed)
    })
  }
  

  validateBlockTransactions(block){
    return new Promise(async (resolve, reject)=>{
      if(isValidBlockJSON(block)){
        let txHashes = Object.keys(block.transactions);
        let errors = {}
        for await (let hash of txHashes){
          let transaction = block.transactions[hash];
          let valid = await this.validateTransaction(transaction);
          if(valid.error){
            errors[hash] = valid.error
            //If contains invalid tx, need to reject block alltogether
            // delete block.transactions[hash];
          }
        }
        if(Object.keys(errors).length > 0) resolve({error:errors})
        else resolve(block);
      }else{
        logger('ERROR: Must pass block object')
        resolve(false)
      }
      
    })
  }
  
  blockContainsOnlyValidTransactions(block){
    return new Promise(async (resolve, reject)=>{
      if(isValidBlockJSON(block)){
        let txHashes = Object.keys(block.transactions);
        let errors = {}
        for await (let hash of txHashes){
          let transaction = block.transactions[hash];
          let valid = await this.validateTransaction(transaction);
          if(valid.error){
            errors[hash] = valid.error
            //If contains invalid tx, need to reject block alltogether
            // delete block.transactions[hash];
          }
        }
        if(Object.keys(errors).length > 0) resolve({error:errors})
        else resolve(true);
      }else{
        resolve({error:'ERROR: Must pass block object'})
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
            console.log('Root:', root)
            console.log('Recalculated:', recalculatedMerkleRoot)
            console.log('Transaction', transactions)
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
        var isTransactionCall = transaction.type == 'call'
        var isStake = transaction.type == 'stake'
        var isResourceAllocation = transaction.type == 'allocation'

        let alreadyExistsInBlockchain = this.spentTransactionHashes.includes(transaction.hash)
        if(alreadyExistsInBlockchain) resolve({error:'Transaction already exists in blockchain'})

        let alreadyExistsInMempool = await this.mempool.getTransaction(transaction.hash)
        if(alreadyExistsInMempool) resolve({error:'Transaction already exists in mempool'})
        else if(alreadyExistsInMempool.error) resolve({error:alreadyExistsInMempool})

        if(isTransactionCall){

          let isValidTransactionCall = await this.validateTransactionCall(transaction);
          if(isValidTransactionCall.error) resolve({error:isValidTransactionCall.error})
          else resolve(isValidTransactionCall)


        }else if(isMiningReward){
          
          let isValidCoinbaseTransaction = await this.validateCoinbaseTransaction(transaction)

          if(isValidCoinbaseTransaction.error) resolve({error:isValidCoinbaseTransaction.error})

          if(isValidCoinbaseTransaction && !isValidCoinbaseTransaction.error){
            resolve(true)
          }

        }else if(isStake){
          //validateStakeTransaction

        }else if(isResourceAllocation){
          //validateAllocationTransaction

        }else {

          let isValidTransaction = await this.validateSimpleTransaction(transaction)
          if(isValidTransaction.error) resolve({error:isValidTransaction.error})
          else resolve(isValidTransaction)
        }
        
      }catch(err){
        resolve({error:'ERROR: an error occured'})
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

        let fromAddressIsAccount = await this.accountTable.getAccount(fromAddress);
        let toAddressIsAccount = await this.accountTable.getAccount(toAddress);

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

          //validate nonce from balanceTable

          let isSignatureValid = await this.validateSignature(transaction, fromAddress);
          if(!isSignatureValid) resolve({error:'REJECTED: Transaction signature is invalid'});

          let isNotCircular = fromAddress !== toAddress;
          if(!isNotCircular) resolve({error:"REJECTED: Sending address can't be the same as receiving address"});

          var balanceOfSendingAddr = await this.checkBalance(fromAddress)
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

  async validateTransactionCall(transaction){
    return new Promise(async (resolve, reject)=>{
      if(transaction){
        try{

            let fromAccount = await this.accountTable.getAccount(transaction.fromAddress)
            if(!fromAccount) resolve({error:'REJECTED: Sending account is unknown'});
            else{

              let isSignatureValid = await this.validateActionSignature(transaction, fromAccount.ownerKey)
              let toAccount = await this.accountTable.getAccount(transaction.toAddress) //Check if is contract
              let toAccountIsContract = await this.contractTable.getContract(transaction.toAddress)
              var isChecksumValid = this.validateChecksum(transaction);
              var amountHigherOrEqualToZero = transaction.amount >= 0;
              let hasMiningFee = transaction.miningFee >= this.calculateTransactionMiningFee(transaction); //check size and fee 
              var transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
              let isNotCircular = fromAccount.name !== toAccount.name
              var balanceOfSendingAddr = await this.checkBalance(fromAccount.ownerKey) //+ this.checkFundsThroughPendingTransactions(transaction.fromAddress);
              let hasEnoughFunds = balanceOfSendingAddr >= transaction.amount + transaction.miningFee

              if(!toAccount) resolve({error:'REJECTED: Receiving account is unknown'});
              if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
              //By enabling this, coins are burnt. 
              //By disabling, something bugs down the line
              if(!amountHigherOrEqualToZero) resolve({error:'REJECTED: Amount needs to be higher than or equal to zero'});
              if(!hasMiningFee) resolve({error:"REJECTED: Mining fee is insufficient"});
              if(!transactionSizeIsNotTooBig) resolve({error:'REJECTED: Transaction size is above 10KB'});
              if(!isSignatureValid) resolve({error:'REJECTED: Transaction signature is invalid'});
              if(!toAccountIsContract) resolve({error: 'REJECTED: Transaction calls must be made to contract accounts'})
              if(!isNotCircular) resolve({error:"REJECTED: Sending account can't be the same as receiving account"}); 
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

  async validateCoinbaseTransaction(transaction){
    return new Promise(async (resolve, reject)=>{
      if(transaction){

        try{
  
          let isChecksumValid = this.validateChecksum(transaction);
          let isAttachedToMinedBlock = await this.coinbaseTxIsAttachedToBlock(transaction);
          let hasTheRightMiningRewardAmount = transaction.amount == (this.miningReward + this.calculateTransactionMiningFee(transaction));
          let transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
                  
          if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
          if(!hasTheRightMiningRewardAmount) resolve({error:'REJECTED: Coinbase transaction does not contain the right mining reward: '+ transaction.amount});
          if(!isAttachedToMinedBlock) resolve({error:'COINBASE TX REJECTED: Is not attached to any mined block'})
          if(!transactionSizeIsNotTooBig) resolve({error:'COINBASE TX REJECTED: Transaction size is above '+this.transactionSizeLimit+'Kb'});
          
          resolve(true)
              
        }catch(err){
          resolve({error:err.message})
        }
  
      }else{
        logger('ERROR: Coinbase transaction is undefined');
        resolve({error:'ERROR: Coinbase transaction is undefined'})
      }
  
    })
    

  }

  runTransactionCalls(block){
    return new Promise(async (resolve)=>{
      let transactions = block.transactions;
      let txHashes = Object.keys(block.transactions);
      let errors = {}
      let calls = {}
      for await(var hash of txHashes){
        let transaction = transactions[hash];
        
        if(transaction.type == 'call'){
          let fromAccount = await this.accountTable.getAccount(transaction.fromAddress)
          let toAccount = await this.accountTable.getAccount(transaction.toAddress) //Check if is contract

          let payload = transaction.data

          let call = {
            fromAccount: fromAccount.name,
            data:{
              contractName: toAccount.name,
              method: payload.method,
              params: payload.params,
              memory:payload.memory,
              cpuTime:payload.cpuTime
            },
            hash:transaction.hash
          }

         calls[call.hash] = call
          
        }

        
      }

      if(Object.keys(calls).length > 0){
        if(Object.keys(calls).length == 1){
          let hash = Object.keys(calls)[0];

          let call = calls[hash]
          
          let result = await this.executeSingleCall(call)
          if(result.error) resolve({error:result.error})
          else{
            resolve(result)
          }
        }else{
          let results = await this.executeManyCalls(calls)
          if(results){
            if(results.error) resolve({error:results.error})
            else if(Object.keys(results).length > 0){
              resolve(results)
                
            }else{
              console.log('Returned empty results')
            }
          }else{
            console.log('Ça chie icite')
          }
        }
 
      }else{
        resolve(true)
      }
       
      
    })
  }

  

  

  executeActionBlock(actions){
    return new Promise(async (resolve)=>{
      if(actions && Object.keys(actions).length){
        
        for await(let hash of Object.keys(actions)){
          let action = actions[hash]
          let results = {}
          let errors = {}
          let result = await this.handleAction(action)
          if(result.error) errors[hash] = result.error
          else{
            results[hash] = result
          }

          if(Object.keys(errors).length > 0){
            resolve({error:errors})
          }else{
            resolve(results)
          }
        }
        
      }else{
        resolve(false)
      }
    })
  }

  handleAction(action, blockNumber){
    return new Promise(async (resolve)=>{
      switch(action.type){
        case 'account':
          if(action.task == 'create'){
            let added = await this.accountTable.addAccount(action.data);
            
            if(added){
              resolve(true)
            }else{
              resolve({error:'ERROR: Account already exists'})
            }
          }

          break;
        case 'contract':
          if(action.task == 'deploy'){
            
            let deployed = await this.deployContract(action)
            if(deployed.error){
              resolve({error:deployed.error})
            }else{
              resolve(true)
            }
            
          }

          if(action.task == 'call'){
            let executed = await this.executeSingleCall(action)
            if(executed){
              if(executed.error){
                resolve({error:executed.error})
              }else{
                let state = executed[hash].state;
                let updated = await this.contractTable.updateContractState(action.data.contractName, executed.state, {hash:action.hash}, this.getLatestBlock())
                if(updated.error) resolve({error:updated.error})
                resolve(executed)
              }
            }else{
              resolve({error:'Function has returned nothing'})
            }
            
          }

          if(action.task == 'destroy'){
           let destroyed = await this.destroyContract(action);
           if(destroyed.error){
              resolve({error:destroyed.error})
           }else{
              resolve(destroyed)
           }
            
          }
          resolve({error:'ERROR: Unknown contract task'})
          break;
        default:
          console.log(action)
          resolve({error:'ERROR: Invalid contract call'})
      }
      
      
    })
  }

  testHandleAction(action, blockNumber){
    return new Promise(async (resolve)=>{
      switch(action.type){
        case 'account':
          if(action.task == 'create'){
            let account = action.data
            let existing = await this.accountTable.accountsDB.get(account.name)
            if(!existing){
              resolve(true)
            }else{
              if(existing.error) resolve({error:existing.error})
              resolve({error:'ERROR: Account already exists'})
            }
          }

          break;
        case 'contract':
          if(action.task == 'deploy'){
            
            let deployed = await this.testDeployContract(action)
            if(deployed.error){
              resolve({error:deployed.error})
            }else{
              resolve(true)
            }
            
          }

          if(action.task == 'destroy'){
            let destroyed = await this.testDestroyContract(action)
            if(destroyed.error){
              resolve({error:destroyed.error})
            }else{
              resolve(destroyed)
            }
            
          }

          if(action.task == 'call'){
            let executed = await this.executeSingleCall(action)
            if(executed){
              if(executed.error){
                resolve({error:executed.error})
              }else{
                resolve(executed)
              }
            }else{
              resolve({error:'Function has returned nothing'})
            }
            
          }
          resolve({error:'ERROR: Unknown contract task'})
          break;
        default:
          resolve({error:'ERROR: Invalid contract call'})
      }
      
      
    })
  }

  destroyContract(action){
    return new Promise(async (resolve)=>{
      let contractName = action.data.name;
      
      let account = await this.accountTable.getAccount(action.fromAccount);
      let contract = await this.contractTable.getContract(contractName);
      if(contract){
        if(contract.error) resolve({error:contract.error})
        let contractAccount = contract.account
        if(contractAccount){
          let isValidDestroyActionSignature = await this.validateActionSignature(action, contractAccount.ownerKey)
          if(isValidDestroyActionSignature){
            let deleted = await this.contractTable.removeContract(contractName);
            if(deleted.error){
              resolve({error:deleted.error})
            }else if(deleted && !deleted.error){
              resolve(deleted)
            }
          }else{
            resolve({error:'Only the creator of the contract may destroy it'})
          }
          
        }else{
          resolve({error: 'Could not find contract account'})
        }
        
      }else{
        resolve({error:'Could not find contract to destroy'})
      }
      
    })
  }

  testDestroyContract(action){
    return new Promise(async (resolve)=>{
      let contractName = action.data.name;
      
      let account = await this.accountTable.getAccount(action.fromAccount);
      let contract = await this.contractTable.getContract(contractName);
      if(contract){
        if(contract.error) resolve({error:contract.error})
        let contractAccount = contract.account
        if(contractAccount){
          let isValidDestroyActionSignature = await this.validateActionSignature(action, contractAccount.ownerKey)
          if(isValidDestroyActionSignature){
            resolve({
              contractDeleted:true,
              stateDeleted:true
            })
          }else{
            resolve({error:'Only the creator of the contract may destroy it'})
          }
          
        }else{
          resolve({error: 'Could not find contract account'})
        }
        
      }else{
        resolve({error:'Could not find contract to destroy'})
      }
      
    })
  }

  deployContract(action){
    return new Promise(async (resolve)=>{
      let data = action.data
      let account = await this.accountTable.getAccount(action.fromAccount)
      
      if(account){
        //Validate Contract and Contract API
        let contractEntry = {
          name:data.name,
          contractAPI:data.contractAPI,
          initParams:data.initParams,
          account:account, 
          code:data.code,
          state:data.state
        }

        let added = await this.contractTable.addContract(contractEntry)
        if(added){
          if(added.error) resolve({error:added.error})
          logger(`Deployed contract ${contractEntry.name}`)
          resolve(true)
        }else{
          resolve({error:'ERROR: Could not add contract to table'})
        }
       
        
      }else{
        resolve({error:'ACTION ERROR: Could not get contract account '+action.fromAccount})
      }
    })
  }

  testDeployContract(action){
    return new Promise(async (resolve)=>{
      let data = action.data
      let account = await this.accountTable.getAccount(action.fromAccount)
      
      if(account){

        let alreadyExists = await this.contractTable.contractDB.get(data.name)
        if(!alreadyExists){
            resolve({ success:`Deployed contract ${data.name} successfully` })
        }else{
            resolve({error:'A contract with that name already exists'})
        }

      }else{
        resolve({error:'ACTION ERROR: Could not get contract account'})
      }
    })
  }

 

  async executeManyCalls(calls){
    for await(let hash of Object.keys(calls)){
      let call = calls[hash]
      this.stack.addCall(call, call.data.contractName)
    }

    let codes = await this.stack.buildCode()
    if(codes.error) return {error:codes.error}
    
    let results = await this.vmController.executeCalls(codes)
    if(results.error) return { error:results.error }
    else return results
    // if(Object.keys(errors).length > 0 && Object.keys(results).length > 0){
    //   return results
    // }else if(Object.keys(errors).length > 0 && Object.keys(results).length ==0){
    //   return { error:errors }
    // }else{
    //   return results
    // }
  }

  executeSingleCall(call){
    return new Promise(async (resolve)=>{
        this.stack.addCall(call, call.data.contractName)
        let code = await this.stack.buildCode()
        if(code.error) resolve({error:code.error})

        let result = await this.vmController.executeCalls(code)
        if(result.error) resolve({error:result.error})
        else resolve(result)
         
    })
  }

  testCall(call){
    return new Promise(async (resolve)=>{
      
      let start = Date.now()
      let code = await this.stack.createSingleCode(call)
      if(code.error) resolve({error:code.error})

      let result = await this.vmController.test(code)
      if(result){
        if(result.error) resolve({error:result.error})
        else resolve(result)
      }else{
        console.log(result)
        resolve({ error:'ERROR: VM did not result any results' })
      }
          
    })
  }

  rollbackActionBlock(actions){
      return new Promise(async (resolve)=>{
          if(actions){    
              let hashes = Object.keys(actions)
              let endIndex = hashes.length - 1
              let errors = {}
              for(var index=endIndex; index >= 0; index--){
                  let hash = hashes[index];
                  let action = actions[hash]
                  let rolledBack = await this.rollbackAction(action)
                  if(rolledBack.error) errors[action.hash] = rolledBack.error
              }
          }else{
              resolve({error:'Action block is undefined'})
          }
      })
  }

  rollbackAction(action){
      return new Promise((resolve)=>{
          if(action.type == 'account'){
            if(action.task == 'create'){

            }
          }else if(action.type == 'contract'){
            if(action.task == 'deploy'){
              
            }else if(action.task == 'call'){

            }

          }
      })
  }

  validateContractAction(action){
    return new Promise(async (resolve, reject)=>{
      if(action){
          let account = await this.accountTable.getAccount(action.fromAccount)
          

          let isExistingAccount = ( account? true : false )
          let isChecksumValid = await this.validateActionChecksum(action);
          let actionIsNotTooBig = (Transaction.getTransactionSize(action) / 1024) < this.transactionSizeLimit;
          let isLinkedToWallet = validatePublicKey(account.ownerKey);
          // let hasValidActionRef = this.validateActionReference(action.actionRef)
          
          if(!hasValidActionRef) resolve({error:'ERROR: Invalid action reference passed'})
          if(!isExistingAccount) resolve({error:'ERROR: Account does not exist'})
          if(!isChecksumValid) resolve({error:"ERROR: Action checksum is invalid"})
          if(!isLinkedToWallet) resolve({error:"ERROR: Action ownerKey is invalid"})
          if(!actionIsNotTooBig) resolve({error:'ERROR: Action size is above '+this.transactionSizeLimit+'Kb'})
          
          resolve(true);

      }else{
        resolve({error:'Account or Action is undefined'})
      }
      
      
    })
    
  }

  validateAction(action){
    return new Promise(async (resolve, reject)=>{
      if(action){
          let isCreateAccount = action.type == 'account' && action.task == 'create';
          let account = await this.accountTable.getAccount(action.fromAccount)
          
          if(isCreateAccount){

            if(account) resolve({error:'An account with that name already exists'})
            let newAccount = action.data;
            let isValidAccount = isValidAccountJSON(newAccount);

            if(!isValidAccount) resolve({error:"ERROR: Account contained in create account action is invalid"})

            account = newAccount;
          }

          let isExistingAccount = ( account? true : false )
          let isChecksumValid = await this.validateActionChecksum(action);
          let hasMiningFee = action.fee > 0; //check if amount is correct
          let actionIsNotTooBig = (Transaction.getTransactionSize(action) / 1024) < this.transactionSizeLimit;
          let balanceOfSendingAddr = await this.checkBalance(account.ownerKey)// + this.checkFundsThroughPendingTransactions(action.fromAccount.ownerKey);
          let isLinkedToWallet = validatePublicKey(account.ownerKey);
          let isSignatureValid = await this.validateActionSignature(action, account.ownerKey);

          if(!isExistingAccount){
            resolve({error:'ERROR: Account does not exist'})
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
            //console.log(action)
            console.log(Transaction.getTransactionSize(action))
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

  validateContractAction(action, account){
    return new Promise(async (resolve, reject)=>{
      if(action){
          //Is linked to calling action
          //Is calling action actually calling contract
          let isChecksumValid = await this.validateActionChecksum(action);
          let hasMiningFee = action.fee > 0; //check if amount is correct
          let actionIsNotTooBig = Transaction.getTransactionSize(action) < this.transactionSizeLimit;
          let balanceOfSendingAddr = await this.checkBalance(action.fromAccount.ownerKey)// + this.checkFundsThroughPendingTransactions(action.fromAccount.ownerKey);
          let isLinkedToWallet = validatePublicKey(action.fromAccount.ownerKey);
          let isLinkedToContract = this.isLinkedToContract()
          

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
      // console.log('Validate', transaction.fromAddress+ 
      //  transaction.toAddress+ 
      //  transaction.amount+ 
      //  transaction.data+ 
      //  transaction.timestamp+
      //  transaction.nonce)
       if(sha256(
                transaction.fromAddress+ 
                transaction.toAddress+ 
                (transaction.amount == 0 ? '0' : transaction.amount.toString())+ 
                (typeof transaction.data == 'string' ? transaction.data : JSON.stringify(transaction.data))+ 
                transaction.timestamp.toString()+
                transaction.nonce.toString()
                ) === transaction.hash){
        return true;
      }
    }
    return false;
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
    Checks the validity of the transaction signature
    @param {object} $transaction - Transaction to be inspected
    @return {boolean} Signature is valid or not
  */
  validateSignature(transaction, fromAddress){
    return new Promise(async (resolve, reject)=>{
      if(transaction){
        if(validatePublicKey(fromAddress)){
          const publicKey = await ECDSA.fromCompressedPublicKey(fromAddress);
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


  /**
    Checks the validity of the action signature
    @param {object} $action - Action to be inspected
    @param {object} $ownerKey - Public key of the owner account
    @return {boolean} Signature is valid or not
  */
  validateActionSignature(action, ownerKey){
    return new Promise(async (resolve, reject)=>{
      if(action && ownerKey){
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
  coinbaseTxIsAttachedToBlock(transaction){
    let found = false;

    let block = this.getBlockFromHash(transaction.blockHash)
    if(block.hash == transaction.blockHash){
      found = block;
    }
        
    return found
  }

    /**
    Fetches a block from chainDB
    @param {string} $blockNumberString - Block number is converted to string before making query
    @return {Promive<Block>} Block queried or error if is not found
  */
  getGenesisBlockFromDB(){
    return new Promise(async(resolve)=>{
      let genesisBlockEntry = await this.chainDB.get('0')
      if(genesisBlockEntry){
          if(genesisBlockEntry.error) resolve({error:genesisBlockEntry.error})
          
          resolve(genesisBlockEntry)
      }else{
          resolve(false)
      }
      
    })
    
  }


  /**
    Inits the blockchain by, first, fetching the last block/last state store in a JSON file
    Then, if loaded, will download the entirety of the blockchain from database
    Then will load balance state table
    @return {Promise} Success or failure
  */
  init(){
    return new Promise(async (resolve, reject)=>{
      logger('Loading all blocks. Please wait...')
      try{
        let loaded = await this.loadBlocks()
        if(loaded){
          let contractTableStarted = await this.contractTable.init()
          
          let savedBalances = await this.balance.loadBalances(this.getLatestBlock().blockNumber)
          if(savedBalances.error){
            reject(savedBalances.error)
          }else{
            resolve(savedBalances)
          }
          
        }else{
          reject('Could not load blocks')
        }
      }catch(e){
        reject(e)
      }
      
      
    })
  }

  /**
    First, looks for genesisBlock in chain to see if blockchain has been created
      - If so, will load last block and will go about downloading the entire chain
      - If not, will load genesisBlock config from file (or create it) then will push it to 
        database and will initiate balance state table
    @return {Promise} Success or failure
  */
  loadBlocks(){
    return new Promise(async (resolve, reject)=>{
      //See if genesis block has been added to database
      try{
        let genesisBlock = await this.getGenesisBlockFromDB()
        if(genesisBlock){
          if(genesisBlock.error) reject(genesisBlock.error)
          this.chain[0] = genesisBlock
          let lastBlock = await this.getLastKnownBlockFromDB()
          if(lastBlock && lastBlock.blockNumber){
            let iterator = Array(lastBlock.blockNumber + 1)
          
            logger('Loaded last known block')
            for await(let blockNumber of [...iterator.keys()]){
              
              if(typeof blockNumber == 'number') blockNumber = blockNumber.toString()
              if(blockNumber > 0){
                let block = await this.getBlockFromDB(blockNumber)
                if(block){
                  if(block.error) {
                    reject(block.error)
                  }
      
                  //Could plug in balance loading from DB here
                  let txHashes = Object.keys(block.transactions)
                  this.spentTransactionHashes.push(...txHashes)
                  this.chain.push(block)
                  if(blockNumber == lastBlock.blockNumber){
                    logger(`Finished loading ${parseInt(blockNumber) + 1} blocks`) 
                    resolve(true)
                  }
                }
              }else{
                if(blockNumber > 0) logger(`ERROR: Could not find block ${blockNumber}`)
              }
             
            }
          }else{
            this.chain.push(genesisBlock)
            logger(`Finished loading genesis block`) 
            resolve(true)
          }


        }else{
          logger('Genesis Block has not been created yet')
          let genesisBlock = await this.loadGenesisFile()
          logger('Loaded genesis block from config file')
          if(genesisBlock.error) reject(genesisBlock.error)

          this.balance.states = genesisBlock.states;
          let saved = await this.balance.saveBalances(genesisBlock)
          
          let added = await this.genesisBlockToDB(genesisBlock)
          if(added){
            if(added.error) reject(added.error)
            logger('Added genesis block to blockchain')
            this.chain.push(genesisBlock)
            // let saved = await this.putBlockToDB(genesisBlock)
            
            resolve(true);

          }else{
            reject('Error adding genesis block to db')
          }
          
        }
        
      }catch(e){
        reject(e)
      }

    })
    
  }

  /**
   * Saves only the last block to JSON file
   */
  save(){
    return new Promise(async (resolve)=>{
      // let lastBlock = await writeToFile(this.getLatestBlock(), './data/lastBlock.json')
      let lastBlock = await this.saveLastKnownBlockToDB()
      if(lastBlock){
        if(lastBlock.error) resolve({error:lastBlock.error})
        resolve(true);
       
      }else{
        logger('ERROR: Could not save blockchain state')
        resolve(false)
      }
      
    })
  }

}

module.exports = Blockchain;

