/**
 TFLB | Thousandfold Blockchain
 @author: Sacha-Olivier Dulac
*/


/////////////////////Blockchain///////////////////////
const sha256 = require('../../tools/sha256');
const {  
  logger, 
  RecalculateHash, 
  writeToFile,
  validatePublicKey,
  merkleRoot, 
  readFile, } = require('../../tools/utils');
const { isValidAccountJSON, isValidHeaderJSON, isValidBlockJSON, isValidTransactionJSON } = require('../../tools/jsonvalidator');
const Transaction = require('../transactions/transaction');
const BalanceTable = require('../tables/balanceTable');
const AccountTable = require('../tables/accountTable');
const ContractTable = require('../tables/contractTable');
const Factory = require('../contracts/build/callFactory')
const VMController = require('../contracts/vmController')
/******************************************** */

const Block = require('./block');
const Consensus = require('./consensus')
const { setNewChallenge, setNewDifficulty, Difficulty } = require('../mining/challenge');
const chalk = require('chalk');
const ECDSA = require('ecdsa-secp256r1');
const fs = require('fs');
let _ = require('private-parts').createKey();
const genesis = require('../../tools/getGenesis')
const Database = require('../database/db')
/**
  * @desc Basic blockchain class.
  * @param {Array} $chain Possibility of instantiating blockchain with existing chain. 
  *                       Not handled by default
*/
class Blockchain{

  constructor(chain=[], mempool, consensusMode){
    this.chain = chain
    this.chainSnapshot = {}
    this.chainDB = new Database('blockchain');
    this.blockPoolDB = new Database('blockPool');
    this.branchesDB = new Database('branches');
    this.mempool = mempool
    this.accountTable = new AccountTable();
    this.balance = new BalanceTable(this.accountTable)
    this.consensusMode = consensusMode || genesis.consensus
    this.difficulty = new Difficulty(genesis)
    this.consensus = new Consensus({
      consensusMode:this.consensusMode,
      chain:this.chain,
      difficulty:this.difficulty,
      accountTable:this.accountTable
    })
    this.contractTable = new ContractTable({
      getCurrentBlock:async ()=>{
        return await this.getLatestBlock()
      },
      getBlock:(number)=>{
        return this.chain[number]
      },
      getBlockFromHash:(hash)=>{
          return this.getBlockFromHash(hash)
      }
    })
    this.factory = new Factory({
      accountTable:this.accountTable,
      contractTable:this.contractTable,
      getBlockNumber:()=>{
        return this.getLatestBlock()
      }
    })
    this.vmController = new VMController({
      contractTable:this.contractTable,
      accountTable:this.accountTable,
      buildCode:this.factory.createSingleCode,
      deferContractAction:async(contractAction)=>{
        let deferred = await this.mempool.deferContractAction(contractAction)
        if(deferred){
          return deferred
        }else{
          return false
        }
      },
      emitcastContractAction:async(contractAction)=>{
        let isValidContractAction = await this.validateContractAction(contractAction)
        if(isValidContractAction.error) return { error:isValidContractAction.error }
        else{
          let added = await this.mempool.addAction(contractAction)
          if(added.error) return { error:added.error }
          else{
            return added
          }
        }
      },
      getCurrentBlock:async ()=>{
        return this.getLatestBlock()
      }
    })
    this.spentTransactionHashes = {}
    this.spentActionHashes = {}
    this.isSyncingBlocks = false
    this.branches = {}
    this.unlinkedBranches = {}
    this.looseBlocks = {}
    this.miningReward = 50;
    this.blockSize = 5; //Minimum Number of transactions per block
    this.maxDepthForBlockForks = 3;
    this.transactionSizeLimit = 10 * 1024;
  }

  async createGenesisBlock(){
    let genesisBlock = new Block({
      timestamp:1554987342039,
      transactions:{ 
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
          },
      actions:{}
    })
    genesisBlock.difficulty = '0x1024'//'0x100000';//'0x2A353F';
    genesisBlock.totalDifficulty = genesisBlock.difficulty
    genesisBlock.challenge = setNewChallenge(genesisBlock)
    genesisBlock.blockTime = 10
    genesisBlock.consensus = "Proof of Work" //Possible values : Proof of Work, Permissioned, Proof of Stake, Proof of Importance
    genesisBlock.network = "mainnet"
    genesisBlock.maxCoinSupply = Math.pow(10, 10);
    genesisBlock.signatures = {}
    genesisBlock.hash = sha256( genesisBlock.maxCoinSupply + genesisBlock.difficulty + genesisBlock.challenge + genesisBlock.merkleRoot + genesisBlock.signatures )
    genesisBlock.calculateHash();
    genesisBlock.states = {
      //Other public addresses can be added to initiate their balance in the genesisBlock
      //Make sure at least one of the them has some funds, otherwise no transactions will be possible
      "coinbase":{ balance:1000 * 1000 * 1000 * 1000 },
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

  /**
   * @desc Helper function to get the latest full block, not just the header
   */
  async getLatestFullBlock(){
    let latestHeader = this.getLatestBlock()
    let block = await this.getBlockFromDB(latestHeader.blockNumber)
    if(!block || block.error){
      block = await this.getBlockFromDB(latestHeader.blockNumber - 1)
    }

    return block
  }

  // addBlockToChain(newBlock, silent=false){
  //   return new Promise(async (resolve)=>{
  //     //Push block header to chain
  //     var isNextBlock = newBlock.blockNumber == this.getLatestBlock().blockNumber + 1
  //     let blockNumberAlreadyExists = this.chain[newBlock.blockNumber]
  //     let blockAlreadyExists = await this.getBlockbyHash(newBlock.hash)
      
  //     if(blockNumberAlreadyExists || blockAlreadyExists){
  //       resolve({error:`ERROR: Block ${newBlock.blockNumber} already exists`})
  //     }else if(!isNextBlock){
  //       resolve({error:'ERROR: Number of new block does not follow latest block'})
  //     }else{
  //       let errors = {}
  //       let newHeader = this.extractHeader(newBlock)
  //       this.chain.push(newHeader);

  //       let start = process.hrtime();
  //       var areTransactionsValid = await this.validateBlockTransactions(newBlock)
  //       if(areTransactionsValid.error) errors['TRANSACTION ERROR'] = areTransactionsValid.error
  //       let hrend = process.hrtime(start)
  //       // console.info('TxValid time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)

  //       start = process.hrtime();
  //       var doesNotContainDoubleSpend = await this.blockDoesNotContainDoubleSpend(newBlock)
  //       if(!doesNotContainDoubleSpend) errors['DOUBLE SPEND ERROR'] = 'ERROR: Block may not contain a transaction that is already spent'
  //       hrend = process.hrtime(start)
  //       // console.info('DoubleSpend time: %ds %dms', hrend[0], hrend[1] / 1000000)

  //       if(Object.keys(errors).length > 0) resolve({error:errors})
  //       else{
  //         start = process.hrtime();
  //         let executed = await this.balance.runBlock(newBlock)
  //         hrend = process.hrtime(start)
  //         // console.info('Balance run time: %ds %dms', hrend[0], hrend[1] / 1000000)
          
  //         if(executed.error) errors['BALANCE ERROR'] = executed.error
  //         else{
  //           start = process.hrtime();
  //           let saved = await this.balance.saveBalances(newBlock)
  //           if(saved.error) resolve({error:saved.error})
  //           hrend = process.hrtime(start)
  //           // console.info('Balance save time: %ds %dms', hrend[0], hrend[1] / 1000000)
            
  //           start = process.hrtime();
  //           let actions = newBlock.actions || {}
  //           let allActionsExecuted = await this.executeActionBlock(actions)
  //           if(allActionsExecuted.error) errors['ACTION ERROR'] = allActionsExecuted.error;
  //           hrend = process.hrtime(start)
  //           // console.info('Actions time: %ds %dms', hrend[0], hrend[1] / 1000000)
            
  //           start = process.hrtime();
  //           let callsExecuted = await this.runTransactionCalls(newBlock);
  //           if(callsExecuted.error) errors['CALL ERROR'] = callsExecuted.error
  //           hrend = process.hrtime(start)
  //           // console.info('Calls time: %ds %dms', hrend[0], hrend[1] / 1000000)
            
  //           start = process.hrtime();
  //           let transactionsDeleted = await this.mempool.deleteTransactionsFromMinedBlock(newBlock.transactions)
  //           if(!transactionsDeleted) errors['MEMPOOL ERROR'] = 'ERROR: Could not delete transactions from Mempool'
  //           hrend = process.hrtime(start)
  //           // console.info('DeleteTx time: %ds %dms', hrend[0], hrend[1] / 1000000) 
            
  //           start = process.hrtime();
  //           let actionsDeleted = await this.mempool.deleteActionsFromMinedBlock(actions)
  //           if(!actionsDeleted) errors['MEMPOOL ERROR'] = 'ERROR: Could not delete actions from Mempool' 
  //           hrend = process.hrtime(start)
  //           // console.info('DeleteActions time: %ds %dms', hrend[0], hrend[1] / 1000000) 
            
  //           //Verify is already exists
  //           if(Object.keys(errors).length > 0){
  //             let removedNewHeader = this.chain.pop()
  //             resolve({error: errors})
  //           }else{
  //             start = process.hrtime();
  //             for await(let hash of newHeader.txHashes){
  //               this.spentTransactionHashes[hash] = { spent:newHeader.blockNumber }
  //             }
  //             hrend = process.hrtime(start)
  //             // console.info('SpendTx time: %ds %dms', hrend[0], hrend[1] / 1000000) 

  //             start = process.hrtime();
  //             if(newHeader.actionsHashes){
  //               for await(let hash of newHeader.actionHashes){
  //                 this.spentActionHashes[hash] = { spent:newHeader.blockNumber }
  //               }
  //             }
  //             hrend = process.hrtime(start)
  //             // console.info('SpendAction time: %ds %dms', hrend[0], hrend[1] / 1000000) 

  //             start = process.hrtime();
  //             let statesSaved = await this.contractTable.saveStates(newHeader)
  //             if(statesSaved.error) logger('STATE SAVE ERROR', statesSaved.error)
  //             hrend = process.hrtime(start)
  //             // console.info('SaveState time: %ds %dms', hrend[0], hrend[1] / 1000000) 
              
  //             start = process.hrtime();
  //             let added = await this.addBlockToDB(newBlock)
  //             hrend = process.hrtime(start)
  //             // console.info('AddBlock time: %ds %dms', hrend[0], hrend[1] / 1000000) 
  //             if(added){
  //               if(added.error) resolve({error:added.error})
    
  //               let saved = await this.saveLastKnownBlockToDB()
  //               if(saved.error) logger('LAST BLOCK ERROR:', saved.error)
                
  //               if(!silent) logger(chalk.green(`[$] New Block ${newBlock.blockNumber} created : ${newBlock.hash.substr(0, 25)}...`));
                
  //               resolve(true);
                
  //             }else{
    
  //               resolve({ error:'Could not push new block' })
  //             }
              
  //           }
  //         }
  //       }
        

  //     }
  //   })
  // }


  /**
   * minedBlock => validate =>               - addBlock => runBlock
   *                                         - addBlockToPool
   * 
   * peerBlock => validate => route block => - addBlock => runBlock
   *                                         - addBlockToPool
   *                                         
   *                                          
   */

  async receiveBlock(newBlock, getMissingBlocks){
    if(isValidBlockJSON(newBlock)){
      //Already exists in chain?
      let blockAlreadyExists = await this.getBlockbyHash(newBlock.hash)
      if(blockAlreadyExists) return { error:`ERROR Block ${newBlock.blockNumber} already exists` }
      //Is none of the above, carry on with routing the block
      //to its proper place, either in the chain or in the pool
      let success = await this.routeBlock(newBlock)
      return success
      
    }else{
      return { error:`ERROR: Block does not have valid structure` }
    }
  }

  async routeBlock(newBlock){
    let isValidBlock = await this.validateBlock(newBlock)
    if(isValidBlock.error) return { error:isValidBlock.error }
    else{

      let isNextBlock = newBlock.blockNumber == this.getLatestBlock().blockNumber + 1
      let isLinked = newBlock.previousHash == this.getLatestBlock().hash
      if(isNextBlock && isLinked) return await this.addBlock(newBlock)
      else{

        let isTenBlocksAhead = newBlock.blockNumber >= this.getLatestBlock().blockNumber + 5
        if(isTenBlocksAhead){
          //In case of a major fork
          let rollback = await this.rollbackToBlock(this.getLatestBlock().blockNumber - 20)
          if(rollback.error) return { error:rollback.error }
          else return { requestUpdate:true }
        }
        
        let isLinkedToBlockInPool = await this.getBlockFromPool(newBlock.previousHash)
        // console.log('Is linked to branch', typeof isLinkedToBlockInPool)
        if(isLinkedToBlockInPool && isLinkedToBlockInPool.error) return { error:isLinkedToBlockInPool.error }
        else if(isLinkedToBlockInPool && !isLinkedToBlockInPool.error){
          let blockFromPool = isLinkedToBlockInPool
          let branch = [ blockFromPool, newBlock ]
          // let removed = await this.removeBlockFromPool(blockFromPool.hash)
          // console.log('Create new branch')
          // return await this.addNewBranch(newBlock.hash, branch)
          let isValidCandidate = await this.validateBranch(newBlock, branch)
          if(isValidCandidate) return { rollback:blockFromPool.blockNumber - 2 }
          else return { stay:true }
        }else{
          // console.log('Add new block')
          return await this.addBlockToPool(newBlock)
        }

      } //

    }
  }

  async addBlock(newBlock){
    let isValidBlock = await this.validateBlock(newBlock);
    if(isValidBlock){
      if(isValidBlock.error) return { error:isValidBlock.error }

      let newHeader = this.extractHeader(newBlock)
      this.chain.push(newHeader);

      let executed = await this.runBlock(newBlock)
      if(executed.error){
        this.chain.pop()
        return { error:executed.error }
      }
      else {
        let added = await this.addBlockToDB(newBlock)
        if(added.error){
          this.chain.pop()
          return { error:added.error }
        }
        else{
          this.manageChainSnapshotQueue(newBlock)
          logger(`${chalk.green('[] Added new block')} ${newBlock.blockNumber} ${chalk.green('to chain:')} ${newBlock.hash.substr(0, 20)}...`)
          return added
        }
      }
    }else{
      return { error:`ERROR: Block ${newBlock.blockNumber} is not valid` }
    }
  }

  async addBlockToPool(newBlock){
    //Already exists in block pool?
    let blockExistsInPool = await this.getBlockFromPool(newBlock.hash)
    if(blockExistsInPool && blockExistsInPool.error) return { error:blockExistsInPool.error }
    else if(blockExistsInPool) return { error:`ERROR: Block ${newBlock.blockNumber} already exists in pool` }
    else{
      let added = await this.blockPoolDB.put({
        key:newBlock.hash,
        value:newBlock
      })
      if(added.error) return { error:added.error }
      else {
        logger(`${chalk.cyan('[] Added block')}  ${newBlock.blockNumber} ${chalk.cyan('to pool:')} ${newBlock.hash.substr(0, 20)}...`)
        return added
      }
    }
    
  }

  async removeBlockFromPool(hash){
    //Already exists in block pool?
    let blockExistsInPool = await this.getBlockFromPool(hash)
    if(blockExistsInPool && blockExistsInPool.error) return { error:blockExistsInPool.error }
    else{
      return await this.blockPoolDB.deleteId(hash)
    }
    
  }

  async addNewBranch(lastHash, branch){
    let firstBlock = branch[0]
    let lastBlock = branch[branch.length - 1]
    let added = await this.branchesDB.put({
      key:lastHash,
      value:branch
    })
    if(added.error) return { error:added.error }
    else {
      
      let isValidCandidate = await this.validateBranch(lastBlock, branch)
      console.log('Valid Candidate:', isValidCandidate)
      if(isValidCandidate){
        return await this.integrateBranch(branch)
      }else{
        logger(`${chalk.cyan('[][] Added new branch at')}  ${firstBlock.blockNumber} ${chalk.cyan(':')} ${firstBlock.hash.substr(0, 20)}...`)
        return added
      }
    }
    
  }

  async removeBranch(hash){
    //Already exists in block pool?
    let branch = await this.getBranch(hash)
    if(branch && branch.error) return { error:branch.error }
    else{
      return await this.branchesDB.deleteId(hash)
    }
    
  }

  async addBlockToBranch(newBlock){
    let branch = await this.getBranch(newBlock.previousHash);
    if(branch){
      if(branch.error) return { error:branch.error }
      
      let extendedBranch = [ ...branch, newBlock ]
      
      // let removed = await this.removeBranch(newBlock.previousHash)
      
      let added = await this.addNewBranch(newBlock.hash, extendedBranch);
      if(added && added.error) return { error:added.error }
      else return added
      
    }else{
      return { error:`ERROR: Could not find branch ${newBlock.previousHash.substr(0, 20)}` }
    }
  }

  async getBlockFromPool(hash){
    let block = await this.blockPoolDB.get(hash)
    if(block){
      if(block.error) return { error:block.error }
      else{
        // let block = blockEntry[blockEntry._id]
        return block
      }
    }else{
      return false
    }
  }

  async getBranch(previousHash){
    let branch = await this.branchesDB.get(previousHash)
    if(branch){
      if(branch.error) return { error:branch.error }
      else return branch
    }else{
      return false
    }
  }

  async validateBranch(newBlock, branch){
       
      let forkTotalDifficulty = BigInt(parseInt(newBlock.totalDifficulty, 16))
      let currentTotalDifficulty = BigInt(parseInt(this.getLatestBlock().totalDifficulty, 16))
      console.log('Branch',forkTotalDifficulty)
      console.log('This', currentTotalDifficulty)
      let branchHasMoreWork = (forkTotalDifficulty > currentTotalDifficulty)

      let branchIsMuchLonger = branch.length - this.chain.length >= 5
      
      if(branchHasMoreWork || branchIsMuchLonger){
        return true
      }else{
        return false
      }
    
  }

  async integrateBranch(branch){
    
    const pushBlocks = async (branch) =>{
      for await(let block of branch){
        let added = await this.addBlock(block)
        if(added.error) return { error:added.error }
      }
      return true
    }
    
    let firstBlock = branch[0];
    let lastBlock = branch[branch.length - 1]
    let latestBlock = await this.getLatestFullBlock();
    let isLinkedToLast = latestBlock.hash == firstBlock.previousHash
    // console.log('Linked to last', isLinkedToLast)
    let isSameHeightAsLast = latestBlock.previousHash == firstBlock.previousHash
    // console.log('Same height', isSameHeightAsLast)
    let isLinkedToEarlierBlock = await this.getBlockFromDBByHash(firstBlock.previousHash)
    // console.log('Is linked to earlier', typeof isLinkedToEarlierBlock)
    let isLinkedToBlockInPool = await this.getBlockFromPool(firstBlock.previousHash)
    // console.log('isLinked to block in pool', typeof isLinkedToBlockInPool)
    let isLinkedToBranch = await this.getBranch(firstBlock.previousHash)
    // console.log('is linked to branch', typeof isLinkedToBranch)

    if(isLinkedToLast){

      let pushed = await pushBlocks(branch)
      if(pushed.error) return { error:pushed.error }
      else return { swapped:lastBlock.hash }

    }else if(isSameHeightAsLast){
      
      let rolledBack = await this.rollbackToBlock(firstBlock.blockNumber - 1)
      if(rolledBack.error) return { error:rolledBack.error }

      let pushed = await pushBlocks(branch)
      if(pushed.error) return { error:pushed.error }
      else return { swapped:lastBlock.hash }

    }else if(isLinkedToBranch){

      if(isLinkedToBranch.error) return { error:isLinkedToBranch.error }
      let otherBranch = isLinkedToBranch
      let extendedBranch = [ ...otherBranch, ...branch ]
      let lastBlock = extendedBranch[extendedBranch.length -1]
      return await this.addNewBranch(lastBlock.hash, extendedBranch)

    }else if(isLinkedToBlockInPool){
      if(isLinkedToBlockInPool.error) return {error:isLinkedToBlockInPool.error}
      let blockFromPool = isLinkedToBlockInPool
      branch = [ blockFromPool, ...branch ]
      return { linked:blockFromPool.hash }

    }else if(isLinkedToEarlierBlock){
      if(isLinkedToEarlierBlock.error) return {error:isLinkedToEarlierBlock}
      let linkedToBlock = isLinkedToEarlierBlock
      let rolledBack = await this.rollbackToBlock(linkedToBlock.blockNumber)
      if(rolledBack.error) return { error:rolledBack.error }

      let pushed = await pushBlocks(branch)
      if(pushed.error) return { error:pushed.error }
      else return { swapped:lastBlock.hash }
      
    }else{
        logger(`${chalk.cyan('[][]> Extended branch of')} ${branch.length} ${chalk.cyan('blocks to')} ${lastBlock.blockNumber} ${chalk.cyan(':')} ${lastBlock.hash.substr(0, 10)}`)
        return { extended:lastBlock.hash }
    }
  }

  async runBlock(newBlock){
    let newHeader = this.extractHeader(newBlock)
    let executed = await this.balance.runBlock(newBlock)
    if(executed.error) return executed.error

    let actions = newBlock.actions || {}
    let allActionsExecuted = await this.executeActionBlock(actions)
    if(allActionsExecuted.error) return { error:allActionsExecuted.error }

    let saved = await this.balance.saveBalances(newBlock)
    if(saved.error) return { error:saved.error }

    let callsExecuted = await this.runTransactionCalls(newBlock);
    if(callsExecuted.error) return { error:callsExecuted.error }

    let transactionsDeleted = await this.mempool.deleteTransactionsFromMinedBlock(newBlock.transactions)
    if(transactionsDeleted.error) return { error:transactionsDeleted.error }

    let actionsDeleted = await this.mempool.deleteActionsFromMinedBlock(actions)
    if(actionsDeleted.error) return { error:actionsDeleted.error }

    for await(let hash of newHeader.txHashes){
      this.spentTransactionHashes[hash] = { spent:newHeader.blockNumber }
    }

    if(newHeader.actionsHashes){
      for await(let hash of newHeader.actionHashes){
        this.spentActionHashes[hash] = { spent:newHeader.blockNumber }
      }
    }

    let statesSaved = await this.contractTable.saveStates(newHeader)
    if(statesSaved.error) return { error:statesSaved.error }

    let savedLastBlock = await this.saveLastKnownBlockToDB()
    if(savedLastBlock.error) return { error:savedLastBlock.error }

    return true


  }


  // /**
  //  * Validate and add block to database and blockchain
  //  * @param {Block} newBlock 
  //  * @param {boolean} silent 
  //  */
  // pushBlock(newBlock, silent=false){
  //   return new Promise(async (resolve)=>{
  //     if(isValidBlockJSON(newBlock)){
  //       let isValidBlock = await this.validateBlock(newBlock);
  //       if(isValidBlock.error){
  //         resolve({error:isValidBlock.error})
  //       }
  //       else{
  //         let blockAlreadyExists = await this.getBlockbyHash(newBlock.hash)
  //         if(blockAlreadyExists) resolve({error:'ERROR: Block already exists in blockchain'})
  //         else{
            
  //           var isLinked = this.isBlockLinked(newBlock);
  //           var linkToChain = await this.getBlockbyHash(newBlock.previousHash)
  //           var isLinkedToChain = linkToChain && linkToChain.blockNumber == newBlock.blockNumber - 1
  //           let blockNumberAlreadyExists = this.chain[newBlock.blockNumber]
  //           let isLinkedToBranch = this.branches[newBlock.previousHash]
  //           let isLinkedToUnlinkedBranch = this.unlinkedBranches[newBlock.previousHash]
  
  //           /**
  //            * Possible return values
  //            * Linked branches
  //            *  extended - Either created or extended a blockchain branch, nothing to do here
  //            *  switched - Swapped branches with one that has more work or is longer
  //            * Unlinked branches
  //            *  extended - Either created or extended an unlinked blockchain branch, nothing to do here
  //            *  findMissing - Query peer with the longest blockchain for the missing blocks at block hash
  //            * 
  //            * Basically, the only other result to handle, aside from an error or a success, is findMissing
  //            */
  //           if(isLinked){
  //             if(blockNumberAlreadyExists){
  //               let branched = await this.createNewBranch(newBlock);
  //               if(branched.error) resolve({error:branched.error})
  //               else resolve(branched)
  //             }else{
                
  //               let added = await this.addBlockToChain(newBlock, silent)
  //                 if(added.error) resolve({error:added.error})
  //                 else resolve(added)
  //             }
  //           }else{
  //             if(isLinkedToChain){
  //               let branched = await this.createNewBranch(newBlock);
  //               if(branched.error) resolve({error:branched.error})
  //               else resolve(branched)
  //             }else if(isLinkedToBranch){
  //               let extended = await this.extendBranch(newBlock)
  //               if(extended.error) resolve({error:extended})
  //               else resolve(extended)
  //             }else if(isLinkedToUnlinkedBranch){
  //               let extended = await this.extendUnlinkedBranch(newBlock);
  //               if(extended.error) resolve({error:extended.error})
  //               else resolve(extended)
  //             }else{
  //               let branched = await this.createNewUnlinkedBranch(newBlock)
  //               if(branched.error) resolve({error:branched.error})
  //               else resolve(branched)
  //             }
  //           }
  
  //         }
  //       }
        
  //     }else{
  //       resolve({error:'ERROR: New block undefined'})
  //     }
  //   })

  // }


  // async createNewBranch(newBlock){
  //   let alreadyExists = this.branches[newBlock.hash]
  //   if(!alreadyExists){
  //     this.branches[newBlock.hash] = [ newBlock ]
  //     logger(chalk.cyan(`[*] New branch at block ${newBlock.blockNumber} : ${newBlock.hash.substr(0, 23)}...`));
  //     return true
  //   }else{
  //     return { error:'ERROR: Block already exists in branch' }
  //   }
  // }

  // async createNewUnlinkedBranch(newBlock){
  //   //Pushing new block with previous so that node may find the missing blocks and use the last one found to 
  //   //fetch the unlinkedBranch created here
  //   let isLooseBlockLinked = false
  //   let looseBlock = this.looseBlocks[newBlock.previousHash]
  //   if(looseBlock) isLooseBlockLinked = await this.chain.getBlockbyHash(looseBlock.previousHash)
  //   let alreadyExists = this.unlinkedBranches[newBlock.previousHash]
  //   if(!alreadyExists && !isLooseBlockLinked){
  //     if(looseBlock) this.unlinkedBranches[looseBlock.previousHash] = [ looseBlock, newBlock ]
  //     else this.unlinkedBranches[newBlock.previousHash] = [ newBlock ]
  //     logger(chalk.yellow(`* Unlinked branch at previous block ${newBlock.blockNumber} : ${newBlock.hash.substr(0, 15)}...`));
  //     return { unlinked:newBlock.hash, blockNumber:newBlock.blockNumber }
  //   }else if(!alreadyExists && isLooseBlockLinked){

  //     let looseBlocks = [ looseBlock, newBlock ]
  //     for await(let block of looseBlocks){
  //       let isValidCandidate = await this.validateBranch(block)
  //       if(isValidCandidate){
  //         if(isValidCandidate.error) return { error:isValidCandidate.error }
  //         let isValid  = await this.validateBlock(block)
  //         if(isValid.error) return { error:isValid.error }

  //         let added = await this.addBlockToChain(block)
  //         if(added.error) return { error:added.error }
  //       }
  //     }

  //     return looseBlocks
      
  //   }else{
  //     return { error:'ERROR: Block already exists in branch' }
  //   }
  // }

  // async branchContainsBlockNumber(newBlock, branch){
  //   for await(let block of branch){
  //     if(block.blockNumber == newBlock.blockNumber){
  //       return true
  //     }
  //   }

  //   return false
  // }

  // async extendBranch(newBlock){
  //   let existingBranch = this.branches[newBlock.previousHash]
  //   if(existingBranch){
  //     let alreadyInBranch = await this.branchContainsBlockNumber(newBlock, existingBranch)
  //     if(alreadyInBranch) return false;
  //     else{
  //       existingBranch.push(newBlock)
  //       this.branches[newBlock.hash] = [ ...existingBranch ]
  //       delete this.branches[newBlock.previousHash]
  //       logger(chalk.cyan(`[*] Extended branch at block ${newBlock.blockNumber} : ${newBlock.hash.substr(0, 18)}...`));
  //       //check out branch and validate it
  //       //if valid candidate for branch swap, swap
  //       //if not, stay on main chain

  //       let isValidCandidateBranch = await this.validateBranch(newBlock, existingBranch);

  //       if(isValidCandidateBranch){
  //         global.minerChannel.emit('nodeEvent', 'stopMining')
  //         global.minerChannel.emit('nodeEvent', 'isSwitchingBranch')
  //         let switched = await this.switchToBranch(existingBranch)
  //         global.minerChannel.emit('nodeEvent', 'finishedSwitchingBranch')
  //         if(switched.error) return { error:switched.error }
  //         else return { switched:switched }
  //       }else{
  //         return { extended:true }
  //       }
  //     }
      
  //   }else{
  //     return await this.createNewBranch(newBlock)
  //   }
  // }

  // async extendUnlinkedBranch(newBlock){
  //   let existingUnlinkedBranch = this.unlinkedBranches[newBlock.previousHash]
  //   if(existingUnlinkedBranch){
  //     let alreadyInBranch = await this.branchContainsBlockNumber(newBlock, existingUnlinkedBranch)
  //     if(alreadyInBranch) return false;
  //     else{
  //       let firstUnlinkedBlock = existingUnlinkedBranch[0]
  //       if(!firstUnlinkedBlock) return { error:'ERROR: Unlinked branch does not have a first block' }
        
  //       this.unlinkedBranches[newBlock.hash] = [ ...this.unlinkedBranches[newBlock.previousHash], newBlock ]
  //       delete this.unlinkedBranches[newBlock.previousHash]


  //       logger(chalk.yellow(`* Extended unlinked branch at block ${newBlock.blockNumber} : ${newBlock.hash.substr(0, 15)}...`));
  //       //check out branch and validate it
  //       //if valid candidate for branch swap, swap
  //       //if not, stay on main chain

  //       let isValidCandidateBranch = await this.validateBranch(newBlock, existingUnlinkedBranch);

  //       if(isValidCandidateBranch){
  //         logger(chalk.yellow(`* Will now attempt to find missing previous block ${newBlock.blockNumber} : ${newBlock.hash.substr(0, 25)}...`));
  //         //By returning this, node will query peers this newBlock hash's previous blocks 
  //         //until it either links to blockchain or to a branch that is itself linked to the blockchain
  //         return { findMissing:firstUnlinkedBlock.hash, blockNumber:firstUnlinkedBlock.blockNumber }
  //       }else{
  //         return { unlinkedExtended:firstUnlinkedBlock.hash, blockNumber:firstUnlinkedBlock.blockNumber }
  //       }
  //     }
      
  //   }else{
  //     return await this.createNewUnlinkedBranch(newBlock)
  //   }
  // }




  // async switchToBranch(branch){
  //   //Do the branching block respect two out of the three rules to proceed with the switching
  //   //of blockchain branches?
  //   let firstBlockOfBranch = branch[0]
    
  //   //Is the branch linked to current blockchain?
  //   let isLinkedToBlockNumber = await this.getBlockNumberOfHash(firstBlockOfBranch.previousHash)
    
  //   if(!isLinkedToBlockNumber) {
  //     //If it is not linked, proceed to find the missing  
  //     //By adding the branch here, we may look for the missing block, then, when found, we can add it back in and connect
  //     //possibly two branches or connect the branch to the chain
  //     this.unlinkedBranches[firstBlockOfBranch.previousHash] = branch
  //     return { outOfSync:firstBlockOfBranch.previousHash }
  //   }else{
      
  //     //If it is linked, rollback to the block before the split and merge the branched blocks, one by one

  //     // let rolledback = await this.rollbackToMergeBranch(isLinkedToBlockNumber)
  //     let rolledback = await this.rollbackToMergeBranch(isLinkedToBlockNumber)
  //     if(rolledback){
  //       let previousBlock = {}
  //       for await(let block of branch){
  //         if(block.hash !== firstBlockOfBranch.hash && previousBlock.hash !== block.previousHash){
  //           console.log(`ERROR: Block ${block.blockNumber} is not linked to previous block`)
  //           console.log('Previous:', previousBlock)
  //           console.log('Current:', block)
            
  //         }else{

  //           let synced = await this.addBlockToChain(block, true)
  //           if(synced.error)  return { findMissing:true }
  //           else{
  //             logger(chalk.cyan(`* Merged block ${block.blockNumber} : ${block.hash.substr(0, 20)}...`));
  //             previousBlock = block;
  //           }
            
  //         }
          
  //       }
  //       logger(chalk.cyan(`* Swapped branches`));
  //       return { switched:true }
  //       // if(rolledback.error) return { error:rolledback.error }
  //       // else{
  //       //   if(rolledback && Array.isArray(rolledback)){
  //       //     let lastRolledBackBlock = rolledback[rolledback.length - 1]
  //       //     this.branches[lastRolledBackBlock.hash] = rolledback
  //       //   }else{
  //       //     console.log('Rolled back is not array', rolledback)
  //       //   }
  //       // }
       
  //       // if(rolledback.error) return { error:rolledback.error }
  //       // else{


  //       // }
        

  //     }else{
  //       return { error:`ERROR: Could not rollback to block ${firstBlockOfBranch.blockNumber - 1}. Latest block is that height` }
  //     }
  //   }
  // }

  async rollbackToMergeBranch(blockNumber, tries=0){
    let maxTries = 3
    let isPartOfChain = this.chain[blockNumber]
    let isLastBlock = this.getLatestBlock().blockNumber == blockNumber
    if(isPartOfChain){
      let rolledback = await this.rollbackToBlock(blockNumber)
        if(rolledback.error) return { error:rolledback.error }
        else{
          return rolledback
        }
    }else{
      if(tries <= 3){
        return await this.rollbackToMergeBranch(blockNumber-1, tries++)
      }else{
        return { error:`ERROR: Could not rollback to block ${blockNumber}` }
      }
    }
  }

 

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
        let latestBlock = await this.getBlockFromDB( this.getLatestBlock().blockNumber)
        let fallBack = await this.getBlockFromDB( this.getLatestBlock().blockNumber - 1)
        let blockToSet = latestBlock
        if(!latestBlock || latestBlock.error){
          blockToSet = fallBack
        }
        let saved = await this.chainDB.add({
          _id:'lastBlock',
          'lastBlock':blockToSet
        })
        if(saved.error) resolve({error:saved})
        else resolve(saved)
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

  async getBlockFromDBByHash(hash){
      let header = await this.getBlockbyHash(hash)
      if(header){
        let block = await this.getBlockFromDB(header.blockNumber)
        if(block.error) return { error:block.error }
        else return block
      }else{
        return false
      }
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
        let header = await this.getBlockbyHash(hash)
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
        if(block.blockNumber != 0){
          if(block.actionHashes){
            if(block.actionHashes.includes(hash)){
              let body = await this.getBlockFromDB(block.blockNumber)
              if(body){
                if(body.actions){
                  let action = body.actions[hash];
                  found = true
                  resolve(action)
                }else{
                  resolve({error:`ERROR: Body of block ${block.blockNumber} does not contain actions`})
                }
              }else{
                resolve({error:`ERROR: Body of block ${block.blockNumber} does not exist`})
              }
            }else{
              if(lastBlock.blockNumber == block.blockNumber && !found){
                resolve({error:'ERROR: Could not find anything for action '+ hash.substr(0, 10)})
              }
            }
          }else{
            resolve({error:`ERROR: Header ${block.blockNumber} does not have action hashes`})
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
    let total = BigInt(0);
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
     let total = BigInt(0);
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
      if(lastBlock.hash == block.previousHash){
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

  async getBlockbyHash(hash){
    for await(let block of this.chain){
      if(block.hash === hash) return block
    }

    return false;
  }

  async getNextBlockbyHash(hash){
    for await(let block of this.chain){
      if(block.previousHash === hash) return block
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
    return new Promise(async (resolve)=>{
      let transactionHashes = Object.keys(block.transactions);
      let coinbase = false
      for await(var hash of transactionHashes){
        let tx = block.transactions[hash]
        if(tx.fromAddress == 'coinbase'){
          if(!coinbase){
            coinbase = tx;
          }else{
            resolve(false)
          }
        }
      }

      resolve(coinbase)
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
      
      var chainAlreadyContainsBlock = await this.getBlockbyHash(block.hash);
      var doesNotContainDoubleSpend = true//await this.blockDoesNotContainDoubleSpend(block)
      var isValidHash = block.hash == RecalculateHash(block);
      var isValidTimestamp = await this.validateBlockTimestamp(block)
      var singleCoinbase = await this.validateUniqueCoinbaseTx(block)
      var coinbaseIsAttachedToBlock = this.coinbaseIsAttachedToBlock(singleCoinbase, block)
      var isValidConsensus = await this.consensus.validate(block)
      var merkleRootIsValid = await this.isValidMerkleRoot(block.merkleRoot, block.transactions);
     
      // if(!isValidTimestamp) resolve({error:'ERROR: Is not valid timestamp'})
      if(!doesNotContainDoubleSpend) resolve({ error:`ERROR: Block ${block.blockNumber} contains double spend` })
      if(!isValidConsensus) resolve({ error:'ERROR: Block does not meet consensus requirements' })
      if(!coinbaseIsAttachedToBlock) resolve({error:'ERROR: Coinbase transaction is not attached to block '+block.blockNumber})
      if(!singleCoinbase) resolve({error:'ERROR: Block must contain only one coinbase transaction'})
      if(!merkleRootIsValid) resolve({error:'ERROR: Merkle root of block is not valid'})
      if(!isValidHash) resolve({error:'ERROR: Is not valid block hash'})
      if(chainAlreadyContainsBlock) resolve({error:'ERROR: Chain already contains block'})
      
      resolve(true)
    })
    
  }

  //Deprecated????
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

  async blockDoesNotContainDoubleSpend(block){
    let txHashes = Object.keys(block.transactions);
    let actionHashes = Object.keys(block.actions);

    for await(let hash of txHashes){
      let exists = this.spentTransactionHashes[hash]
      if(exists) return false
    }

    for await(let hash of actionHashes){
      let exists = this.spentActionHashes[hash]
      if(exists) return false
    }

    return true

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
      txHashes:(block.transactions? Object.keys(block.transactions) : []),
      actionHashes:(block.actions ? Object.keys(block.actions):[]),
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
            }
          }
          resolve(txHashes)
        })
      }

      let errors = {}
      let totalBlockNumber = this.chain.length
      
      if(number < 0) number = 0
      let startNumber = ( typeof number == 'number' ? number : parseInt(number)  )
      
      let newLastBlock = this.chain[number];
      let numberOfBlocksToRemove = totalBlockNumber - number;
      
      //Getting a copy of the blocks that will later be removed from the chain
      
      let blocks = this.chain.slice(startNumber + 1, this.chain.length)

      let newestToOldestBlocks = blocks.reverse()
      let actionHashes = await collectActionHashes(newestToOldestBlocks)
      let txHashes = await collectTransactionHashes(newestToOldestBlocks)
      
      for await(let hash of txHashes){
        if(this.spentTransactionHashes[hash]){
          delete this.spentTransactionHashes[hash]
        }
      }

      for await(let hash of actionHashes){
        if(this.spentActionHashes[hash]){
          delete this.spentActionHashes[hash]
        }
      }
      
      if(actionHashes.length > 0){
        for await(var hash of actionHashes){
          //Rolling back actions and contracts
          let action = await this.getActionFromDB(hash);
          if(action){
            if(action.error) resolve({error:action.error})
            else{
              if(action.type == 'contract'){
                if(action.task == 'deploy'){
                  let contractName = action.data.name;
                  let deleted = await this.contractTable.removeContract(contractName);
                  if(deleted.error) errors[hash] = deleted.error
  
                }
                
              }else if(action.type == 'account'){
                let account = action.data
                let removed = await this.accountTable.deleteAccount({ name:account.name, signature:account.ownerSignature });
                if(removed.error) errors[hash] = removed.error
              }
            }
            
          }
        }
      }

      let rolledBack = await this.balance.rollback(number.toString())
      if(rolledBack.error) resolve({error:rolledBack.error})

      let stateRolledBack = await this.contractTable.rollback(newLastBlock.blockNumber)
      if(stateRolledBack.error) resolve({error:stateRolledBack.error})

      let backToNormal = newestToOldestBlocks.reverse()
      let removed = this.chain.splice(startNumber + 1, numberOfBlocksToRemove)
      
      let mainBranch = []

      for await(let header of removed){
        let deleted = await this.chainDB.deleteId(header.blockNumber.toString())
        if(deleted.error) return deleted.error
      }

      this.createNewSnapshot()
      logger('Rolled back to block ', number)
      logger(`Head block is now ${this.getLatestBlock().hash.substr(0, 25)}`)
      if(Object.keys(errors).length > 0) resolve({error:errors})
      else{
        resolve(mainBranch)
      }
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
        resolve({error:'ERROR: Must pass block object'})
      }
      
    })
  }
  //Redundant with the above method ^
  validateTransactionsOfBlock(block){
    return new Promise(async (resolve, reject)=>{
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
      
    })
  }

  async validateTransactionsBeforeMining(transactions){
    let rejectedTransactions = {}
    let acceptedTransactions = {}

    for await(let hash of Object.keys(transactions)){
      let transaction = transactions[hash]

      let isValid = await this.validateTransaction(transaction);
      if(isValid && !isValid.error){  
        let alreadyExistsInBlockchain = this.spentTransactionHashes[hash]
        if(!alreadyExistsInBlockchain){
          acceptedTransactions[hash] = transaction
        }else{
          rejectedTransactions[hash] = transaction
        }
      }else{
        rejectedTransactions[hash] = transaction
      }
      
    }

    if(Object.keys(rejectedTransactions).length >0){
      let deleted = await this.mempool.deleteTransactionsOfBlock(rejectedTransactions);
      if(deleted.error) return { error:deleted.error }
    }

    return acceptedTransactions
  }

  async validateActionsBeforeMining(actions){
    let rejectedActions = {}
    let acceptedActions = {}

    for await(let hash of Object.keys(actions)){
      let action = actions[hash]

      let isValid = await this.validateAction(action);
      if(isValid && !isValid.error){
        let alreadyExistsInBlockchain = this.spentActionHashes[hash]
        if(!alreadyExistsInBlockchain){
          acceptedActions[hash] = action
        }else{
          rejectedActions[hash] = action
        }
        acceptedActions[hash] = action
      }else{
        rejectedActions[hash] = action
      }
      
    }

    if(Object.keys(rejectedActions).length > 0){
      let deleted = await this.mempool.deleteActionsOfBlock(actions)
      if(deleted.error) return { error:deleted.error }
    }

    return acceptedActions
  }



  coinbaseIsAttachedToBlock(transaction, block){
    if(block.coinbaseTransactionHash === transaction.hash){
      return true
    }else{
      return false
    }
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

        let alreadyExistsInBlockchain = this.spentTransactionHashes[transaction.hash]
        if(alreadyExistsInBlockchain) resolve({error:'Transaction already exists in blockchain'})

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
            if(!fromAccount) resolve({error:`REJECTED: Sending account ${transaction.fromAddress} is unknown`});
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

              if(!toAccount) resolve({error:`REJECTED: Receiving account ${transaction.toAddress} is unknown`});
              if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
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
          // let isAttachedToMinedBlock = await this.coinbaseTxIsAttachedToBlock(transaction);
          let hasTheRightMiningRewardAmount = transaction.amount + transaction.miningFee <= (this.miningReward + this.calculateTransactionMiningFee(transaction));
          let transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
                  
          if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
          if(!hasTheRightMiningRewardAmount) resolve({error:'REJECTED: Coinbase transaction does not contain the right mining reward: '+ transaction.amount});
          // if(!isAttachedToMinedBlock) resolve({error:'COINBASE TX REJECTED: Is not attached to any mined block'})
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

  convertTransactionToCall(transaction){
    return new Promise(async (resolve)=>{
      let fromAccount = await this.accountTable.getAccount(transaction.fromAddress)
      if(fromAccount.error) resolve({error:fromAccount.error})
      let toAccount = await this.accountTable.getAccount(transaction.toAddress) //Check if is contract
      if(toAccount.error) resolve({error:toAccount})

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

      resolve(call)
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
          let call = await this.convertTransactionToCall(transaction)
          if(call.error) resolve({error:call.error})
          else calls[call.hash] = call
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
              resolve({error:'ERROR: Call execution returned an empty result object'})
            }
          }else{
            resolve({error:'ERROR: Call execution did not return any result'})
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
        case 'contract action':
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
      this.factory.addCall(call, call.data.contractName)
    }

    let codes = await this.factory.buildCode()
    if(codes.error) return {error:codes.error}
    
    let results = await this.vmController.executeCalls(codes)
    if(results.error) return { error:results.error }
    else return results
  }

  executeSingleCall(call){
    return new Promise(async (resolve)=>{
        this.factory.addCall(call, call.data.contractName)
        let code = await this.factory.buildCode()
        if(code.error) resolve({error:code.error})
        
        let result = await this.vmController.executeCalls(code)
        
        if(result){
          if(result.error) resolve({error:result.error})
          else resolve(result)
        }else{
          resolve({ error:'ERROR: VM did not result any results' })
        }
        
         
    })
  }

  testCall(call){
    return new Promise(async (resolve)=>{
      
      
      let code = await this.factory.createSingleCode(call)
      if(code.error) resolve({error:code.error})
      let start = process.hrtime()
      let result = await this.vmController.test(code)
      
      let hrend = process.hrtime(start)

      // console.info('Execution time : %ds %dms', hrend[0], hrend[1] / 1000000)
      if(result){
        if(result.error) resolve({error:result.error})
        else resolve(result)
      }else{
        console.log('No result',result)
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
      return new Promise(async (resolve)=>{
          if(action.type == 'account'){
            if(action.task == 'create'){
              let accountData = action.data
              let account = await this.accountTable.getAccount(accountData.name)
              if(account){
                if(account.error) resolve({error:account.error})
                let deleted = await this.accountTable.deleteAccount(accountData)
                if(deleted.error) resolve({error:deleted.error})
                else resolve(deleted)
              }else{
                //Is not a fatal error since faulty code may be inserted in the blockchain
                //but never fully executed. As long as such faulty code is executed by all nodes
                //in the same way, it's fine
                resolve({error:`Could not find account ${accountData.name} in database`})
              }
            }
          }else if(action.type == 'contract'){
            if(action.task == 'deploy'){
              let contractData = action.data
              let exists = await this.contractTable.getContract(contractData.contractName)
              if(exists){
                if(exists.error) resolve({error:exists.error})
                else{
                  let deleted = await this.contractTable.removeContract(contractData.contractName)
                  if(deleted.error) resolve({error:deleted.error})
                  else resolve(deleted)
                }
              }else{
                //Again, not a fatal error
                resolve({error:`Contract ${contractData.contractName} does not exist`})
              }

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

  validateActionReference(actionReference, contractAction){
    return new Promise(async (resolve)=>{
      let contractName = actionReference.data.contractName
      let referenceExists = false
      for await(let block of this.chain){
        referenceExists = block.txHashes[hash]
        if(!referenceExists){
          referenceExists = block.actionHashes[hash]
        }
      }
      let contract = await this.contractTable.getContract(contractName)
      resolve({error:`ERROR: Contract ${contractName} does exist`})
      
      let contractAPI = contract.contractAPI;
      resolve({error:`ERROR: Contract ${contractName} does not have an API`})

      let contractMethod = contractAPI[actionReference.data.method];
      resolve({error:`ERROR: Contract method ${actionReference.data.method} does not exist`})

      let pointsToCorrectMethod = contractMethod.returns == 'contract action';
      resolve({error:`ERROR: Action reference does not point to method returning a contract action`})

       
      /**
       * Todo:
       * add a returns field to contractAPIs
       * 
       * Logic:
       * ---> send action calling method that returns contract action
       * <--- sends contract action, linking action as reference
       *      for all references:
       *        - validate if original action is linked to contract action
       *        - validate action content
       *  Mine contract action and execute
       * ***********************************
       * If block contains contract action:
       * - check action reference to see if exists
       * - check if already used before
       * - check if reference points to valid method
       * 
       *
       * 
       */
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
          let sendingAcccount = await this.accountTable.getAccount(action.fromAccount)
          let isLinkedToWallet = await validatePublicKey(sendingAcccount.ownerKey);
          let references = action.actionReference;
          
          

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
  coinbaseTxIsAttachedToBlock(transaction, block){
    if(block.coinbaseTransactionHash === transaction.hash){
      return true
    }else{
      return false
    }
    
    
  }

  /**
   * Keeps a trace of the top most recent blocks and their link to previous blocks
   * @param {Block} newBlock 
   */
  manageChainSnapshotQueue(newBlock){
    let maxNumberOfHashes = 10;

    this.chainSnapshot[newBlock.hash] = {
      blockNumber:newBlock.blockNumber,
      previousHash:newBlock.previousHash,
      difficulty:newBlock.difficulty,
      totalDifficulty:newBlock.totalDifficulty
    }
    
    let elements = Object.keys(this.chainSnapshot)
    if(elements.length > maxNumberOfHashes){
      let firstHash =  elements[0]
      delete this.chainSnapshot[firstHash]
      
    }
  }

    /**
   * Keeps a trace of the top most recent blocks and their link to previous blocks
   *  
   */
  createNewSnapshot(){
    let maxNumberOfHashes = 10;
    let blockNumber = this.getLatestBlock().blockNumber
    this.chainSnapshot = {}
    for(var i=blockNumber - 10; i  <= blockNumber; i++){
      let block = this.chain[i]
      this.manageChainSnapshotQueue(block)
    }

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
        // let gitIgnore = await this.addGitIgnoreToBlockchainFolder()
        this.isLoadingBlocks = true
        let loaded = await this.loadBlocks()
        this.isLoadingBlocks = false
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
          let lastBlock = await this.getLastKnownBlockFromDB()
          if(lastBlock && lastBlock.blockNumber){
            let iterator = Array(lastBlock.blockNumber + 1)
            this.chain[0] = genesisBlock
            logger('Loaded last known block')
            for await(let blockNumber of [...iterator.keys()]){
              let block = await this.getBlockFromDB(blockNumber)
                if(block){
                  if(block.error) {
                    reject(block.error)
                  }
                  //Could plug in balance loading from DB here
                  let txHashes = Object.keys(block.transactions)
                  let actionHashes = Object.keys(block.actions)
                  for await(let hash of txHashes){
                    this.spentTransactionHashes[hash] = { spent:block.blockNumber }
                  }
                  for await(let hash of actionHashes){
                    this.spentActionHashes[hash] = { spent:block.blockNumber }
                  }
                  this.manageChainSnapshotQueue(block)
                  this.chain.push(this.extractHeader(block))
                  if(blockNumber == lastBlock.blockNumber){
                    logger(`Finished loading ${parseInt(blockNumber) + 1} blocks`) 
                    resolve(true)
                  }
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

