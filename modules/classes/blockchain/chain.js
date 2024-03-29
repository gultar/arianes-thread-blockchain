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
const ValidationController = require('../transactions/validationController')
/******************************************** */

const Block = require('./block');
const Consensus = require('./consensus')
const { setNewChallenge, setNewDifficulty, Difficulty } = require('../mining/challenge');
const chalk = require('chalk');
const ECDSA = require('ecdsa-secp256r1');
const fs = require('fs');
let _ = require('private-parts').createKey();
const genesis = require('../../tools/getGenesis')
const Database = require('../database/db');
const blockExecutionDebug = require('debug')('blockExecution')
/**
  * @desc Basic blockchain class.
  * @param {Array} $chain Possibility of instantiating blockchain with existing chain. 
  *                       Not handled by default
*/
class Blockchain{

  constructor(chain=[], mempool, consensusMode){
    this.chain = chain
    this.blockPool = {}
    this.chainSnapshot = {}
    this.chainDB = new Database('blockchain');
    this.mempool = mempool
    this.accountTable = new AccountTable();
    this.balance = new BalanceTable(this.accountTable)
    this.consensusMode = consensusMode || genesis.consensus
    this.difficulty = new Difficulty(genesis)
    this.consensus = new Consensus({
      consensusMode:this.consensusMode,
      chain:this.chain,
      getBlock:async (blockNumber)=>{
        return await this.getBlockFromDB(blockNumber)
      },
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
      getBalance:async (accountName)=>{
        if(!accountName) return { error:'ERROR: Undefined account name' }
        let account = await this.accountTable.getAccount(accountName)
        if(account.error) return { error:account.error }

        let balance = this.balance.getBalance(account.ownerKey)
        if(balance.error) return { error:balance.error }
        else return balance
      },
      deferContractAction:async(contractAction)=>{
        let deferred = await this.mempool.deferContractAction(contractAction)
        if(deferred){
          return deferred
        }else{
          return false
        }
      },
      deferPayable:async(payable)=>{
        let deferred = await this.mempool.deferPayable(payable)
        if(deferred){
          return deferred
        }else{
          return false
        }
      },
      emitContractAction:async(contractAction)=>{
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
      emitPayable:async(payable)=>{
        let isValidPayable = await this.validatePayable(payable)
        console.log('Is valid payable', isValidPayable)
        if(isValidPayable.error) return { error:isValidPayable.error }
        else{
          let added = await this.mempool.addTransaction(payable)
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
    this.validatorController = {}
    this.spentTransactionHashes = {}
    this.spentActionHashes = {}
    this.isSyncingBlocks = false
    this.isRollingBack = false
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
    genesisBlock.network = "testnet"
    genesisBlock.faucetActive = true; //If you are to create a live mainnet, you might want to disable this function
    genesisBlock.maxCoinSupply = Math.pow(10, 10);
    genesisBlock.signatures = {}
    genesisBlock.hash = sha256( genesisBlock.maxCoinSupply + genesisBlock.difficulty + genesisBlock.challenge + genesisBlock.merkleRoot + genesisBlock.signatures )
    genesisBlock.calculateHash();
    genesisBlock.states = {
      //Other public addresses can be added to initiate their balance in the genesisBlock
      //Make sure at least one of the them has some funds, otherwise no transactions will be possible
      "coinbase":{ balance:1000 * 1000 * 1000 * 1000 },
     "faucet": {
        "balance": 10000 * 10000 * 10000 * 10000 * 10000
      },
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



  async receiveBlock(newBlock, overwrite=false, contractStates=false){
    if(isValidBlockJSON(newBlock)){
        if(this.isRollingBack) return { error:'ERROR: block not received, chain is rolling back', isRollingBack:true }
        if(this.isRoutingBlock){
          return { error:'ERROR: block not received, node is routing block', isRoutingBlock:true }
        }
        //Already exists in chain?
        let blockAlreadyExists = await this.getBlockbyHash(newBlock.hash)
        if(blockAlreadyExists) return { error:`ERROR Block of hash ${newBlock.hash.substr(0, 15)}... already exists`, exists:true, duplicate:true }
        let blockNumberExistsInDB = await this.getBlockFromDB(newBlock.blockNumber)
        if(blockNumberExistsInDB){
          if(!overwrite) return { error:`ERROR Block ${newBlock.blockNumber} already exists`, exists:true }
          else{
            if(newBlock.blockNumber > this.getLatestBlock().blockNumber){
              let removed = await this.chainDB.delete({ id:newBlock.blockNumber })
              logger('Overwrote block', newBlock.blockNumber)
              if(removed.error) return { error:removed.error }
            }
          }
        }
        //Is none of the above, carry on with routing the block
        //to its proper place, either in the chain or in the pool
        this.isRoutingBlock = newBlock.blockNumber
        global.minerChannel.emit('nodeEvent','isRoutingBlock')
        let startRouteBlock = process.hrtime()
        let success = await this.routeBlock(newBlock, contractStates)
        let endRouteBlock = process.hrtime(startRouteBlock)
        blockExecutionDebug(`Route block: ${endRouteBlock[1]/1000000}`)
        global.minerChannel.emit('nodeEvent','finishedRoutingBlock')
        this.isRoutingBlock = false
        global.minerChannel.emit('nodeEvent','startMining')
        return success
      
      
    }else{
      return { error:`ERROR: Block does not have valid structure` }
    }
  }

  async routeBlock(newBlock, skipCallExecution=false){
    let startValidateBlock = process.hrtime()
    let isValidBlock = await this.validateHeader(newBlock)
    let endValidateBlock = process.hrtime(startValidateBlock)
    blockExecutionDebug(`Validate Block: ${endValidateBlock[1]/1000000}`)
    if(isValidBlock.error) return { error:isValidBlock.error }
    else{

      let isNextBlock = newBlock.blockNumber == this.getLatestBlock().blockNumber + 1
      let isLinked = newBlock.previousHash == this.getLatestBlock().hash
      
      if(isNextBlock && isLinked) return await this.addBlock(newBlock, skipCallExecution)
      else{

        let isTenBlocksAhead = newBlock.blockNumber >= this.getLatestBlock().blockNumber + 10
        if(isTenBlocksAhead){
          //In case of a major fork
          let rollback = await this.rollback(this.getLatestBlock().blockNumber - 20)
          if(rollback.error) return { error:new Error(rollback.error) }
          else return { requestUpdate:true }
        }
        
        let isLinkedToBlockInPool = await this.getBlockFromPool(newBlock.previousHash)
        if(isLinkedToBlockInPool){
          let blockFromPool = isLinkedToBlockInPool
          let branch = [ blockFromPool, newBlock ]
          let isValidCandidate = await this.validateBranch(newBlock, branch)
          if(isValidCandidate) return { rollback:blockFromPool.blockNumber - 1 }
          else return { stay:true }
        }else{
          return await this.addBlockToPool(newBlock)
        }

      } //

    }
  }
 
 async routeBlockToPool(newBlock){
    let isLinkedToBlockInPool = await this.getBlockFromPool(newBlock.previousHash)
    if(isLinkedToBlockInPool){
      let blockFromPool = isLinkedToBlockInPool
      let branch = [ blockFromPool, newBlock ]
      let isValidCandidate = await this.validateBranch(newBlock, branch)
      if(isValidCandidate) return { rollback:blockFromPool.blockNumber - 1 }
      else return { stay:true }
    }else{
      return await this.addBlockToPool(newBlock)
    }
 }

  async addBlock(newBlock, skipCallExecution=false){
    let previousBlockExists = false
    if(newBlock.blockNumber > 1){
      previousBlockExists = await this.getBlockFromDBByHash(newBlock.previousHash)
      if(!previousBlockExists) return { 
        error:new Error(`ERROR: Previous block ${newBlock.blockNumber - 1} of hash ${newBlock.previousHash.substr(0,10)}... is missing from DB`), 
        missing:newBlock.previousHash, 
        missingBlockNumber:newBlock.blockNumber - 1 
      }
      if(previousBlockExists.error) return { error:new Error(previousBlockExists.error) }
    }
    else previousBlockExists = true

    let isValidBlockBody = await this.validateBlockBody(newBlock)
    if(isValidBlockBody.error) return { error:isValidBlockBody.error }

    let newHeader = this.extractHeader(newBlock)
    // if(this.chain.length == newHeader.blockNumber + 1){
    //   let latestToBeOverwritten = this.chain.pop()
    //   console.log('Overwriting header', latestToBeOverwritten)
    // }
    this.chain.push(newHeader)
    let startRunBlock = process.hrtime()
    let executed = await this.runBlock(newBlock, skipCallExecution)
    let endRunBlock = process.hrtime(startRunBlock)
    blockExecutionDebug(`Run Block: ${endRunBlock[1]/1000000}`)
    if(executed.error){
      this.chain.pop()
      return { error:new Error(executed.error) }
    }
    else {
      let added = await this.addBlockToDB(newBlock)
      if(added.error){
        this.chain.pop()
        return { error:new Error(added.error) }
      }
      else{
        // await this.manageChainSnapshotQueue(newBlock)
        logger(`${chalk.green('[] Added new block')} ${newBlock.blockNumber} ${chalk.green('to chain:')} ${newBlock.hash.substr(0, 20)}...`)
        return added
      }
    }
  }

  async addBlockToPool(newBlock){
    //Already exists in block pool?
    let blockExistsInPool = await this.getBlockFromPool(newBlock.hash)
    if(blockExistsInPool && blockExistsInPool.error) return { error:blockExistsInPool.error }
    else if(blockExistsInPool) return { error:`ERROR: Block ${newBlock.blockNumber} already exists in pool`, existsInPool:true }
    else{
      this.blockPool[newBlock.hash] = newBlock
      let blockPoolHashes = Object.keys(this.blockPool)
      if(blockPoolHashes.length > 30){
        let firstBlockHash = blockPoolHashes[0]
        delete this.blockPool[firstBlockHash]
      }
      logger(`${chalk.cyan('[] Added block')}  ${newBlock.blockNumber} ${chalk.cyan('to pool:')} ${newBlock.hash.substr(0, 20)}...`)
      return  { pooled:true }
    }
    
  }

  async getBlockFromPool(hash){
    let block = this.blockPool[hash]
    if(block){
      return block
    }else{
      return false
    }
  }

  async validateBranch(newBlock, branch){
       
      let forkTotalDifficulty = BigInt(parseInt(newBlock.totalDifficulty, 16))
      let currentTotalDifficulty = BigInt(parseInt(this.getLatestBlock().totalDifficulty, 16))
      let branchHasMoreWork = (forkTotalDifficulty > currentTotalDifficulty)

      let branchIsMuchLonger = branch.length - this.chain.length >= 5
      
      if(branchHasMoreWork || branchIsMuchLonger){
        return true
      }else{
        return false
      }
    
  }

  async runBlock(newBlock, skipCallExecution=false){
    let newHeader = this.extractHeader(newBlock)
    
    let startBalanceRunBlock = process.hrtime()
    let executed = await this.balance.runBlock(newBlock)
    if(executed.error) return { error:executed.error }
    let endBalanceRunBlock = process.hrtime(startBalanceRunBlock)
    blockExecutionDebug(`Executed balances: ${endBalanceRunBlock[1]/1000000}ms`)

    let actions = newBlock.actions || {}
    let startActionsExecuted = process.hrtime()
    let allActionsExecuted = await this.executeActionBlock(actions)
    if(allActionsExecuted.error) return { error:allActionsExecuted.error }
    let endActionsExecuted = process.hrtime(startActionsExecuted)
    blockExecutionDebug(`Executed actions: ${endActionsExecuted[1]/1000000}ms`)

    let startSaveBalances = process.hrtime()
    let saved = await this.balance.saveBalances(newBlock)
    if(saved.error) return { error:saved.error }
    let endSaveBalances = process.hrtime(startSaveBalances)
    blockExecutionDebug(`Save balances: ${endSaveBalances[1]/1000000}ms`)
    
    if(skipCallExecution){
      let stateApplied = await this.applyContractStates(skipCallExecution, newBlock.blockNumber)
      if(stateApplied.error) {
        console.log('APPLY STATE ERROR', stateApplied.error)
        let startExecuteCalls = process.hrtime()
        let callsExecuted = await this.runTransactionCalls(newBlock);
        if(callsExecuted.error) return { error:callsExecuted.error }
        let endExecuteCalls = process.hrtime(startExecuteCalls)

        blockExecutionDebug(`Execute calls: ${endExecuteCalls[1]/1000000}ms`)
      }
    }else{
      let startExecuteCalls = process.hrtime()
      let callsExecuted = await this.runTransactionCalls(newBlock);
      if(callsExecuted.error) return { error:callsExecuted.error }
      let endExecuteCalls = process.hrtime(startExecuteCalls)

      blockExecutionDebug(`Execute calls: ${endExecuteCalls[1]/1000000}ms`)
      // logger(`Skipping call execution, saving peer's contract states instead.`)
    }
    
    let startUpdateStates = process.hrtime()
    let updated = await this.contractTable.updateStates()
    if(updated.error) return { error:updated.error }
    let endUpdateStates = process.hrtime(startUpdateStates)
    blockExecutionDebug(`Update states: ${endUpdateStates[1]/1000000}ms`)

    let startTxDelete = process.hrtime()
    let transactionsDeleted = await this.mempool.deleteTransactionsFromMinedBlock(newBlock.transactions)
    if(transactionsDeleted.error) return { error:transactionsDeleted.error }
    let endTxDelete = process.hrtime(startTxDelete)
    blockExecutionDebug(`Tx Delete: ${endTxDelete[1]/1000000}ms`)

    let startActionsDelete = process.hrtime()
    let actionsDeleted = await this.mempool.deleteActionsFromMinedBlock(actions)
    if(actionsDeleted.error) return { error:actionsDeleted.error }
    let endActionsDelete = process.hrtime(startActionsDelete)
    blockExecutionDebug(`Actions Delete: ${endActionsDelete[1]/1000000}ms`)

    let startSpend = process.hrtime()
    for await(let hash of newHeader.txHashes){
      this.spentTransactionHashes[hash] = newHeader.blockNumber//{ spent:newHeader.blockNumber }
    }

    if(newHeader.actionsHashes){
      for await(let hash of newHeader.actionHashes){
        this.spentActionHashes[hash] = newHeader.blockNumber//{ spent:newHeader.blockNumber }
      }
    }
    let endSpend = process.hrtime(startSpend)
    blockExecutionDebug(`Spend : ${endSpend[1]/1000000}ms`)

    let startSaveStates = process.hrtime()
    let statesSaved = await this.contractTable.saveStates(newHeader)
    if(statesSaved.error) return { error:statesSaved.error }
    let endSaveStates = process.hrtime(startSaveStates)
    blockExecutionDebug(`Save states: ${endSaveStates[1]/1000000}ms`)

    let savedLastBlock = await this.saveLastKnownBlockToDB()
    if(savedLastBlock.error) return { error:savedLastBlock.error }

    return true


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



  getBlockTransactions(hash){
      return new Promise(async (resolve)=>{
          let block = this.getBlockFromDBByHash(hash);
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
 
 async reRunBalancesOfBlockchain(){
    global.minerChannel.emit('isBusy')
    this.isRollingBack = true
    let initialBalances = genesis.states

    this.balance.states = initialBalances
    for await(let header of this.chain){
       if(header.blockNumber > 0){
          let block = await this.getBlockFromDB(header.blockNumber)
          if(block.error) throw new Error(block.error)

          let runSuccessful = await this.balance.runBlock(block)
          if(runSuccessful.error) return { error:new Error(runSuccessful.error) }
        
          console.log('Successful balance run:', runSuccessful)
       }
    }


    global.minerChannel.emit('isAvailable')
    this.isRollingBack = false
    return { sucess:this.balance.states }
 }

  /**
   * 
  * @param {object} transaction Unvalidated transaction object 
  * @return {boolean} Validity of transaction, or error object
  */
  async createTransaction(transaction){
    return await this.validationController.validateTransaction(transaction)
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
      if(block.hash == hash) return block.blockNumber
    }
    
    return false;
  }

  isBlockLinkedToPrevious(block){
    if(block){
      let blockNumber = block.blockNumber
      if(typeof block.blockNumber == 'string'){
        blockNumber = parseInt(block.blockNumber)
      }
      var previousBlock = this.chain[blockNumber - 1];
      if(previousBlock){
        if(previousBlock.hash == block.previousHash) return true;
        else{
          return { error:`ERROR: Block ${block.blockNumber} ${block.hash.substr(0,10)} not linked to ${previousBlock.hash.substr(0,10)} ` };
        }
      }else if(!previousBlock && blockNumber > this.getLatestBlock().blockNumber){
        return { higherBlockNumber:true }
      }
    }else{
      return { error:`ERROR: Cannot check if block is linked, block provided is undefined ` }
    }
  }

  isBlockLinkedToPooledBlock(block){
    if(block){
      return this.blockPool[block.previousHash]
    }else{
      return { error:`ERROR: Cannot check if block is linked, block provided is undefined ` }
    }
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
    if(walletState) return walletState.balance;
    else return 0
    
  }

  gatherMiningFees(transactions, actions){
    return new Promise(async (resolve)=>{
      if(transactions){
        let reward = 0;
        var txHashes = Object.keys(transactions);
        for await(var hash of txHashes){
            reward += transactions[hash].miningFee;
        }
  
        if(actions){
          var actionHashes = Object.keys(transactions);
          for await(var hash of actionHashes){
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
        for await(var block of this.chain){
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

  
  async isBlockchainValid(){
    let previousHeader = false
    for await(let block of this.chain){
      if(block.blockNumber > 0){

        if(block.hash !== RecalculateHash(block)){
          console.log(`
            *******************************************************************
            * Current block hash does not match the recalculation
            * Invalid block is : ${block.blockNumber}
            * Hash: ${block.hash.substr(0, 15)}...
            * Recalculated hash: ${RecalculateHash(block)}
            *******************************************************************
          `)
          return {conflict:i};
        }else if(block.previousHash !== previousHeader.hash){
          console.log(`
            *******************************************************************
            * Current block hash is not linked to previous block
            * Invalid block is : ${block.blockNumber}
            * Hash: ${block.hash.substr(0, 15)}...
            * Previous hash: ${previousHeader.hash.substr(0, 15)}...
            *********************************************************************
          `)
          return {conflict:i};
        }

        let blockInDB = await this.getBlockFromDB(block.blockNumber)
        if(!blockInDB) return { error:`ERROR: Could not find block ${block.blockNumber} in DB` }
        if(blockInDB.error) return { error:blockInDB.error }

        
      }

      previousHeader = block
      
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
 
   getDifficultyTotal(){
      return this.getLatestBlock().totalDifficulty
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
    let twentyMinutesInTheFuture = 20 * 60 * 1000
    let previousBlock = this.chain[block.blockNumber - 1] || this.getLatestBlock()
    let previousTimestamp = previousBlock.timestamp
    if(timestamp > previousTimestamp && timestamp < (Date.now() + twentyMinutesInTheFuture) ){
      /**
       * if(block.timestamp < medianBlockTimestamp) return false
        else return true
       */
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
        let block = await this.getBlockFromDB(header.blockNumber.toString())
        
        let isValidBlock = await this.validateHeader(block)
        if(!isValidBlock) return { error: `Block number ${block.blockNumber} is not valid` }
      }
    }

    return true
  }

    /**
    Criteria for validation:
    - Block has successfully calculated a valid hash
    - Block linked with previous block by including previous hash in its own hash calculation
    - Total challenge score matches 
    - Chain doesn't already contain this block
    - Timestamp is greater than previous timestamp
    - All transactions are valid
    - No double spend took place in chain
    @param {string} $block - Block to be validated
  */
  async validateHeader(block){
    try{
        var chainAlreadyContainsBlock = await this.getBlockbyHash(block.hash);
        if(chainAlreadyContainsBlock) return {error:'ERROR: Chain already contains block'}
        
        var isValidHash = block.hash == RecalculateHash(block);
        if(!isValidHash) return {error:'ERROR: Is not valid block hash'}

        var isValidTimestamp = await this.validateBlockTimestamp(block)
        if(!isValidTimestamp) logger(chalk.red('TIMESTAMP ERROR'), `on block ${block.blockNumber}` )
        
        var isValidConsensus = await this.consensus.validate(block)
        if(!isValidConsensus || isValidConsensus.error) return { error:(isValidConsensus ? isValidConsensus.error : 'ERROR: Block does not meet consensus requirements') }

        var merkleRootIsValid = await this.isValidMerkleRoot(block.merkleRoot, block.transactions);
        if(!merkleRootIsValid) return {error:'ERROR: Merkle root of block is not valid'}

        if(block.blockNumber <= this.getLatestBlock().blockNumber + 1){
          var isLinkedToPreviousBlock = this.isBlockLinkedToPrevious(block)
          // console.log('Is linked to previous?', isLinkedToPreviousBlock)
          if(isLinkedToPreviousBlock.error){
              let isLinkedToPool = await this.getBlockFromPool(block.previousHash)
              if(isLinkedToPool) return { pooled:isLinkedToPool }
              else return { error:isLinkedToPreviousBlock.error }
          }
        }
        
        

        return true
        
    }catch(e){
       return { error:e }
    }
  }

  async validateBlockBody(block){
      try{
        var isFork = this.getLatestBlock().blockNumber == block.blockNumber || this.getLatestBlock().blockNumber + 1 == block.blockNumber
        
        var doesNotContainDoubleSpend = this.blockDoesNotContainDoubleSpend(block)
        if(doesNotContainDoubleSpend && doesNotContainDoubleSpend < block.blockNumber - 1) return { error:`ERROR: Block ${block.blockNumber} contains double spend` }
        
        var areValidTx = await this.validateBlockTransactions(block)
        if(areValidTx.error && !isFork) return { error:"ERROR: Block contains spent transactions"} 

        var singleCoinbase = await this.validateUniqueCoinbaseTx(block)
        if(!singleCoinbase) return {error:'ERROR: Block must contain only one coinbase transaction'}

        var coinbaseIsAttachedToBlock = this.coinbaseIsAttachedToBlock(singleCoinbase, block)
        if(!coinbaseIsAttachedToBlock) return {error:'ERROR: Coinbase transaction is not attached to block '+block.blockNumber}

        return true

      }catch(e){
        return { error:e }
      }
  }

  async blockDoesNotContainDoubleSpend(block){
    let txHashes = Object.keys(block.transactions);
    let actionHashes = Object.keys(block.actions);

    for await(let hash of txHashes){
      let exists = this.spentTransactionHashes[hash]
      if(exists) return exists
    }

    for await(let hash of actionHashes){
      let exists = this.spentActionHashes[hash]
      if(exists) return exists
    }

    return false

  }


  /**
    @desc Useful for sync requests
    @param {string} $blockNumber - Index of block
  */

  getBlockHeader(blockNumber){
    
    if(typeof blockNumber == 'number' && blockNumber >= 0){
      return this.chain[blockNumber];
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
      signatures:block.signatures
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
      if(header.hash == RecalculateHash(header)) return true;
      else return false;
    }else return false;
  }

  validateBlockchain(allowRollback){
    
      let isValid = this.isBlockchainValid();
      if(isValid.conflict){
        let atBlockNumber = isValid.conflict;
        //Need to replace with side chain algorithm
        if(allowRollback){
          this.rollback(atBlockNumber-1);
          logger('Rolled back chain up to block number ', atBlockNumber-1)
          return true;
        }else{
          return false;
        }
      }

      return true;
  }

  cancelRollback(block){

  }

  async rollbackOneBlock(){

        //Getting a copy of the blocks that will later be removed from the chain
        let blockToRemove = this.getLatestBlock()
        let { txHashes, actionHashes } = blockToRemove

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
        
        //Preferable to not resolve and error directly here
        if(actionHashes.length > 0){
          for await(var hash of actionHashes){
            //Rolling back actions and contracts
            let action = await this.getActionFromDB(hash);
            if(action){
              if(action.error) return { 
                error:action.error, 
                actionHash:hash, 
                blockNumber:blockToRemove.blockNumber 
              }
              else{
                if(action.type == 'contract'){
                  if(action.task == 'deploy'){
                    let contractName = action.data.name;
                    let deleted = await this.contractTable.removeContract(contractName);
                    if(deleted.error) return { 
                      error:deleted.error, 
                      actionHash:hash, 
                      blockNumber:blockToRemove.blockNumber 
                    }
    
                  }
                  
                }else if(action.type == 'account'){
                  let account = action.data
                  let removed = await this.accountTable.deleteAccount({ name:account.name, signature:account.ownerSignature });
                  if(removed.error) return { 
                    error:removed.error, 
                    actionHash:hash, 
                    blockNumber:blockToRemove.blockNumber 
                  }
                }
              }
              
            }
          }
        }
      
        let blockBefore = this.chain[blockToRemove.blockNumber - 1]

        let deleted = await this.chainDB.deleteId(blockToRemove.blockNumber.toString())
        if(deleted.error) return {error:deleted.error}

        let removed = this.chain.pop()
        
        return { rollbackSuccess:true }
    
  }

  async rollback(number){
    if(!this.isRollingBack){
      if(number && typeof number === 'number'){
        if(number > this.getLatestBlock().blockNumber) return { error:`ERROR: Could not rollback, block number ${number} is higher than latest` }
        
        this.isRollingBack = true
        global.minerChannel.emit("nodeEvent","isRollingBack")
        let highestBlockNumber = this.getLatestBlock().blockNumber
        let headersOfBlocksToRemove = this.chain.slice(number, highestBlockNumber)
        let reversedHeaders = headersOfBlocksToRemove.reverse()
        let error = false
        for await(let header of reversedHeaders){
          let keepBlock = await this.getBlockFromDB(header.blockNumber)
          let rolledBack = await this.rollbackOneBlock()
          if(rolledBack.error){
            throw new Error('ROLLBACK ERROR',rolledBack.error)
            break;
          }
        }

        if(error) return { error:error }

        let rolledBackBalances = await this.balance.rollback(number)
        if(rolledBackBalances.error) return {error:rolledBackBalances.error}
        
        let stateRolledBack = await this.contractTable.rollbackBlock(number)
        if(stateRolledBack.error) return {error:stateRolledBack.error}
        
        this.isRollingBack = false
        global.minerChannel.emit("nodeEvent","finishedRollingBack")
        logger(`Rolled back to block ${number}`)
        return { rolledback:true }
      }else{
        
        return { error:'ERROR: Blocknumber to rollback to must be numerical' }
      }
    }
    else{
      return { error:'WARNING: Could not rollback; chain is already rolling back' }
    }
      
  }

  validateBlockTransactions(block){
    return new Promise(async (resolve, reject)=>{
      if(isValidBlockJSON(block)){
        let txHashes = Object.keys(block.transactions);
        let errors = {}
        for await (let hash of txHashes){
          let transaction = block.transactions[hash];
          let valid = await this.validationController.validateTransaction(transaction);
          if(valid.error) errors[hash] = valid.error
          if(valid.exists){
            let txLocatedInBlockNumber = valid.blockNumber
            let isPartOfForkedBlock = block.blockNumber == txLocatedInBlockNumber
            if(!isPartOfForkedBlock) errors[hash] = valid.exists
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
          let valid = await this.validationController.validateTransaction(transaction);
          if(valid.error) errors[hash] = valid.error
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

      let isValid = await this.validationController.validateTransaction(transaction);
      if(isValid && !isValid.error){  
        let alreadyExistsInBlockchain = this.spentTransactionHashes[hash]
        if(!alreadyExistsInBlockchain) acceptedTransactions[hash] = transaction
        else rejectedTransactions[hash] = transaction
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

      let isValid = await this.validationController.validateAction(action);
      if(isValid && !isValid.error){
        let alreadyExistsInBlockchain = this.spentActionHashes[hash]
        if(!alreadyExistsInBlockchain){
          acceptedActions[hash] = action
        }else{
          rejectedActions[hash] = action
        }
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
          let valid = await this.validationController.validateTransaction(transaction);
          if(valid.error) errors[hash] = valid.error
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
        return false;
      }
    
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
        hash:transaction.hash,
        transaction:transaction
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
          let startExecute = process.hrtime()
          let results = await this.executeManyCalls(calls)
          let endExecute = process.hrtime(startExecute)
          
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

  async applyContractStates(states, blockNumber){
    if(states && Object.keys(states).length > 0){
      for await(let contractName of Object.keys(states)){
        let state = states[contractName]
        let stateSet = await this.contractTable.manuallySetState(contractName, state, blockNumber)
        if(stateSet.error) console.log('STATE SET', stateSet.error)
      }

      return { applied:true }
    }else{
      return { noStateChanged:true }
    }
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

  handleAction(action){
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

  testHandleAction(action){
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
      
      if(result){
        if(result.error) resolve({error:result.error})
        else resolve(result)
      }else{
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
                resolve({error:`Contract ${contractData.contractName} does not exist`})
              }
            }
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
        this.isLoadingBlocks = true
        let loaded = await this.loadBlocks()
        this.isLoadingBlocks = false
        if(loaded){
          let contractTableStarted = await this.contractTable.init()
          
          let savedBalances = await this.balance.loadBalances(this.getLatestBlock().blockNumber)
          this.validationController = new ValidationController({
            balanceTable:this.balance,
            accountTable:this.accountTable,
            contractTable:this.contractTable,
            spentTransactions:this.spentTransactionHashes,
            spentActions:this.spentActionHashes
          })
          let validatorStarted = await this.validationController.startThread()
          if(savedBalances.error){
            reject(savedBalances.error)
          }
          
          resolve(savedBalances)
          
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
      const cliProgress = require('cli-progress');
      
      // create a new progress bar instance and use shades_classic theme
      console.log()
      const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      //See if genesis block has been added to database
      try{
        let genesisBlock = await this.getGenesisBlockFromDB()
        if(genesisBlock){
          if(genesisBlock.error) reject(genesisBlock.error)
          let lastBlock = await this.getLastKnownBlockFromDB()
          

          if(lastBlock && lastBlock.blockNumber > 0){
            let iterator = Array(lastBlock.blockNumber + 1)
            this.chain[0] = genesisBlock
            bar1.start(lastBlock.blockNumber, 0);
            for await(let blockNumber of [...iterator.keys()]){
              let block = await this.getBlockFromDB(blockNumber)
                if(block){
                  if(block.error) {
                    reject(block.error)
                  }
                  
                  let txHashes = Object.keys(block.transactions)
                  let actionHashes = Object.keys(block.actions)
                  for await(let hash of txHashes){
                    this.spentTransactionHashes[hash] = block.blockNumber//{ spent:block.blockNumber }
                  }
                  for await(let hash of actionHashes){
                    this.spentActionHashes[hash] = block.blockNumber//{ spent:block.blockNumber }
                  }
                  // await this.manageChainSnapshotQueue(block)
                  this.chain.push(this.extractHeader(block))
                  // console.log(`Chain is ${block.blockNumber} blocks long`)
                  bar1.update(block.blockNumber);
                  if(blockNumber == lastBlock.blockNumber){
                    bar1.stop();
                    console.log()
                    logger(`Finished loading ${parseInt(blockNumber) + 1} blocks`)
                    resolve(true)
                  }
                }
              
            }
          }else{
            let blockNumbersKnown = await this.chainDB.getAllKeys()
            let blockNumbers = []
            if((!lastBlock || lastBlock.blockNumber == 0) && blockNumbersKnown.length > 2){ 
              
              logger('Last block is unknown but block entries were found in database') //more than 2 because 0 and lastBlock being the only blocks
              for await(let blockNumber of blockNumbersKnown){
                if(blockNumber !== 'lastBlock'){
                  blockNumbers.push(parseInt(blockNumber))
                }
              }
              logger('Sorting blockNumbers')
              let numberOfBlocks = blockNumbers.length
              let lastBlockNumberKnown = numberOfBlocks - 1
              let lastBlockEntry = await this.chainDB.get(lastBlockNumberKnown)
              if(!lastBlockEntry) throw new Error('Could not load latest block in chainDB entries')
              lastBlock = lastBlockEntry[lastBlockNumberKnown]
              logger(`Got lastBlock  ${lastBlock.blockNumber} of hash ${lastBlock.hash.substr(0,15)}...`)
            }else{
              this.chain.push(genesisBlock)
              logger(`Finished loading genesis block`) 
              resolve(true)
            }
            
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

