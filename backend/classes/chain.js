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
const { isValidAccountJSON, isValidHeaderJSON, isValidBlockJSON } = require('../tools/jsonvalidator');
const Transaction = require('./transaction');
const BalanceTable = require('./balanceTable');
const AccountTable = require('./accountTable');
const ContractTable = require('./contractTable')

/*************Smart Contract VM************** */
const callRemoteVM = require('../contracts/build/callRemoteVM')
/******************************************** */

const Block = require('./block');
const { setNewChallenge, setNewDifficulty, Difficulty } = require('./challenge');
const chalk = require('chalk');
const ECDSA = require('ecdsa-secp256r1');
const Mempool = require('./mempool');
const fs = require('fs');
const jsonc = require('jsonc')
let _ = require('private-parts').createKey();
const genesis = require('../tools/getGenesis')
const PouchDB = require('pouchdb');
/**
  * @desc Basic blockchain class.
  * @param {Array} $chain Possibility of instantiating blockchain with existing chain. 
  *                       Not handled by default
*/
class Blockchain{

  constructor(chain=[]){
    this.chain = chain
    this.chainDB = new PouchDB('./data/chainDB');
    this.balance = new BalanceTable()
    this.accountTable = new AccountTable();
    this.contractTable = new ContractTable();
    this.difficulty = new Difficulty(genesis)
    this.blockForks = {}
    this.isSyncingBlocks = false
    this.miningReward = 50;
    this.blockSize = 5; //Minimum Number of transactions per block
    this.maxDepthForBlockForks = 3;
    this.transactionSizeLimit = 10 * 1024;
  }

  async createGenesisBlock(){
    let genesisBlock = new Block(1554987342039,
      { 
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
      this.chainDB.put({
        _id:'0',
        ['0']:genesisBlock
      })
      .then((addedGenesisBlock)=>{
        resolve(true)
        // if(addedGenesisBlock){
        //   this.chainDB.put({
        //       _id:genesisBlock.hash,
        //       [genesisBlock.hash]:genesisBlock.transactions
        //   })
        //   .then(()=>{
        //     
        //   })
        //   .catch(e => {
        //     logger('GENESIS DB STORE ERROR: ', e)
        //     resolve(false)
        //   })
          
        // }else{
        //   logger('Could not add Genesis block to database')
        //   resolve(false)
        // }
      })
      .catch(async (e)=>{
        console.log(e)
        resolve(false)

      })
      
      
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
        if(peerGenesisBlock.hash !== this.chain[0].hash){
          this.chain[0] = peerGenesisBlock
          this.chainDB.get('0')
          .then((currentGenesisBlockContainer)=>{
            this.chain.put({
              _id:'0',
              _rev:currentGenesisBlockContainer._rev,
              ['0']:peerGenesisBlock
            })
            .then(success => resolve(true))
            .catch(e => {
              resolve({error:e})
            })
          })
          .catch((e)=>{
            resolve({error:e})
          })
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
   * Validate and add block to database and blockchain
   * @param {Block} newBlock 
   * @param {boolean} silent 
   */
  pushBlock(newBlock, silent=false){
    return new Promise(async (resolve)=>{
      if(isValidBlockJSON(newBlock)){
        let isValidBlock = await this.validateBlock(newBlock);
        if(isValidBlock){
          var isLinked = this.isBlockLinked(newBlock);
          if(isLinked){
            this.isBusy = true
            //Push block header to chain
            let newHeader = this.extractHeader(newBlock)
            this.chain.push(newHeader);
            
            if(!silent) logger(chalk.green(`[$] New Block ${newBlock.blockNumber} created : ${newBlock.hash.substr(0, 25)}...`));
            //Verify is already exists

            let added = await this.putBlockToDB(newBlock)
            if(added){
              
              let executed = await this.balance.runBlock(newBlock)
              if(executed.error) resolve({error:executed.error})

              let deleted = await Mempool.deleteTransactionsFromMinedBlock(newBlock.transactions);
              if(!deleted) resolve({error:'ERROR: Could not delete transactions from Mempool'})

              if(newBlock.actions){
                let allActionsExecuted = await this.executeActionBlock(newBlock)

                let actionsDeleted = await Mempool.deleteActionsFromMinedBlock(newBlock.actions)
                if(!actionsDeleted) resolve({error:'ERROR: Could not delete actions from Mempool'})

                this.isBusy = false

                if(allActionsExecuted.errors) resolve({error:allActionsExecuted.errors})
                else{
                  resolve(true)
                }
                
              }else if(!newBlock.actions){

                this.isBusy = false
                resolve(true);
              }

            }else{

              this.isBusy = false
              resolve({ error:'Could not push new block' })
            }

          }else{
            let isLinkedToSomeBlock = this.getIndexOfBlockHash(newBlock.previousHash)
            let isLinkedToBlockFork = this.blockForks[newBlock.previousHash]
            if( isLinkedToSomeBlock || isLinkedToBlockFork ){
              
              let isBlockFork = await this.newBlockFork(newBlock)
              if(isBlockFork){
                this.isBusy = false
                if(isBlockFork.error) resolve({error:isBlockFork.error})
                resolve(true)
              }
              
            }else{
              this.isBusy = false
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

  
  newBlockFork(newBlock){
    return new Promise(async (resolve)=>{
      if(this.getLatestBlock().hash != newBlock.hash){
          // if(this.isSyncingBlocks){
          //   this.cachedBlocks.push(newBlock)
          //   resolve({ error:'Node is busy syncing new block' })
          // }
          /**
           * b: Canonical Block
           * f: Forked block
           * r: Root of fork
           *           |-[b][b]! <-- [b] Case 1: Canonical chain will be extended, then fork will be orphaned
           * [b][b][b][r]
           *           |-[f][f]X <-- [f] Case 2: Forked chain will be extended, then, if total difficulty is higher, 
           *           |              forked chain will be adopted, the other branch will be orphaned
           *           |-[f]X    <--  [f] Case 3: Handles more than one forked block
           * Terms:
           * - Fork root, is the block mined before block fork happens. Both blocks are linked to it
           * 
           */
          
          let forkRootBlockNumber = this.getIndexOfBlockHash(newBlock.previousHash)
          if(forkRootBlockNumber < 0 && !this.blockForks[newBlock.previousHash]){

            resolve({ error:'ERROR: Could not create block fork. New block is not linked' })

          }else{
            
            const addNewFork = (newBlock) =>{
                //Store information on the fork to easily track when a block belongs to the fork
                this.blockForks[newBlock.hash] = {
                  root:newBlock.previousHash,
                  previousHash:newBlock.previousHash,
                  hash:newBlock.hash
                }
                logger(chalk.yellow(`* Added new block fork ${newBlock.hash.substr(0, 25)}...`));
                logger(chalk.yellow(`* At block number ${newBlock.blockNumber}...`));
                //Store actual block on the chain, as an array
                //On the parent block of the fork, called the fork root
                this.chain[forkRootBlockNumber][newBlock.hash] = [newBlock]
                
                return true
            }

            const extendFork = async (newBlock) =>{
              let existingFork = this.blockForks[newBlock.previousHash]

              if(existingFork){
                let rootHash = this.blockForks[newBlock.previousHash].root
                let previousBlockHash = this.blockForks[newBlock.previousHash].previousHash
                let newHash = this.blockForks[newBlock.previousHash].hash
                let rootIndex = this.getIndexOfBlockHash(rootHash)
                if(rootIndex){
                  let rootBlock = this.chain[rootIndex];
                  
                  let fork = rootBlock[previousBlockHash]
                  if(!fork) fork = rootBlock[newHash]

                  if(fork && Array.isArray(fork)){
                    fork.push(newBlock)
                    this.blockForks[newBlock.hash] = {
                      root:rootBlock.hash,
                      previousHash:newBlock.previousHash,
                      hash:newBlock.hash
                    }
                    return fork;
                  }else{
                    console.log('RootHash', rootHash)
                    console.log('RootIndex', rootIndex)
                    console.log('RootBlock', rootBlock)
                    console.log('Newblock hash', newBlock.hash)
                    console.log('Newblock previous', newBlock.previousHash)
                    console.log('Block forks', this.blockForks)
                    logger('ERROR: Fork is not an array')
                    return false
                  }

                }else{
                  //Again, root is not part of the chain
                  console.log('RootHash', rootHash)
                  console.log('RootIndex', rootIndex)
                  logger('ERROR: Root is not part of the chain')
                  return false
                }
              }else{
                //Is not linked or would need to be added
                logger('ERROR: Could not find fork info')
                return false
              }
            }

            const resolveFork = (fork) =>{
              return new Promise(async (resolve)=>{
                if(fork && Array.isArray(fork)){

                  let numberOfBlocks = fork.length;
                  let lastBlock = fork[fork.length - 1]
                  let forkTotalDifficulty = BigInt(parseInt(lastBlock.totalDifficulty, 16))
                  let currentTotalDifficulty = BigInt(parseInt(this.getLatestBlock().totalDifficulty, 16))
                  let forkChainHasMoreWork =  forkTotalDifficulty > currentTotalDifficulty
                  
                  if(forkChainHasMoreWork){

                    this.isSyncingBlocks = true

                    let isValidTotalDifficulty = this.calculateWorkDone(fork)
                    if(isValidTotalDifficulty){
                      let forkHeadBlock = fork[0];
                      let rolledBack = await this.rollbackToBlock(forkHeadBlock.blockNumber - 1)
                      if(rolledBack){
                        if(rolledBack.error) resolve({error:rolledBack.error})
                        else{
                          for await(var forkBlock of fork){
                        
                            let newHeader = this.extractHeader(forkBlock)
                            this.chain.push(newHeader);
    
                            logger(chalk.yellow(`* Merged new block ${forkBlock.hash.substr(0, 25)}... from fork `));
                            
                            let executed = await this.balance.runBlock(forkBlock)
                            if(executed.error) resolve({error:executed.error})

                            let actionsExecuted = await this.executeActionBlock(forkBlock)
                            if(actionsExecuted.error) resolve({error:actionsExecuted.error})
    
                            if(forkBlock.actions){
                              forkBlock.transactions['actions'] = forkBlock.actions
                            }
    
                            let replaced = await this.replaceBlockFromDB(forkBlock)
                            if(!replaced){
                              replaced = await this.putBlockToDB(forkBlock)
                            }
                            
                          }
    
                          this.blockForks = {}
                          logger(chalk.yellow(`* Synced ${fork.length} blocks from forked branch`))
                          this.isSyncingBlocks = false;
                          
                          resolve(true)
                        }
                      }
                    }else{
                      logger('Is not valid total difficulty')
                      resolve({error:'Is not valid total difficulty'})
                    }
                  }else{
                    resolve(false)
                  }
                  
                }else{
                  resolve({error:'Fork provided is not an array'})
                }
              })

            }
              
            if(forkRootBlockNumber){
              if(this.blockForks[newBlock.previousHash]){
                resolve({ error:'Could not create fork. Block linked to block fork and chain' })
              }else{
                //This is the first block of the fork
                let added = addNewFork(newBlock)
                resolve(added)
              }
            }else{
              if(this.blockForks[newBlock.previousHash]){
                let extendedFork = await extendFork(newBlock)
                if(extendedFork){
                  let resolved = await resolveFork(extendedFork)
                  if(resolved.error){
                    resolve({error:resolved.error})
                  }else if(resolved){
                    logger(chalk.yellow(`* Finished syncing blockchain fork`))
                    logger(chalk.yellow(`* Now working on head block ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
                    resolve(true)
                  }else{
                    logger(chalk.yellow(`* Staying on main blockchain`))
                    logger(chalk.yellow(`* Head block is ${chalk.white(this.getLatestBlock().hash.substr(0, 25))}...`))
                    resolve(true)
                  }
                }else{
                  resolve({ error:'Could not extend fork' })
                }
              }else{
                resolve({ error:'Could not create fork. Block is not linked' })
              }
            } 
            
          }
      }
    })
  }

  putHeaderToDB(block){
    return new Promise(async (resolve)=>{
      this.chainDB.put({
          _id:block.blockNumber.toString(),
          [block.blockNumber]:this.extractHeader(block)
      })
      .then((addedHeader)=>{
        resolve(addedHeader)
      })
      .catch(e => {
        console.log(e)
        resolve(false)
      })
    })
  }

  putBodyToDB(block){
    return new Promise(async (resolve)=>{
      
      if(block.actions && Object.keys(block.actions).length > 0){
        block.transactions['actions'] = block.actions
      }
      
      this.chainDB.put({
        _id:block.hash,
        [block.hash]:block.transactions
      })
      .then((addedBody)=>{
        delete block.transactions.actions
        resolve(addedBody)
      })
      .catch(e => {
        console.log(e)
        resolve(false)
      })
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
    return new Promise((resolve)=>{
      if(blockNumber){
        this.chainDB.get(blockNumber.toString())
        .then( entry =>{
          let header = entry[entry._id] 
          resolve(header)
        
        })
        .catch( e => {
          // console.log('GET BLOCK HEADER ERROR', e)
          resolve(false)
        })
      }else{
        // console.log('VALID BLOCKNUMBER IS REQUIRED')
        resolve(false)
      }
    })
  }

  getBodyFromDB(hash){
    return new Promise((resolve)=>{
      if(hash){
        this.chainDB.get(hash)
        .then( entry => {
          let body = entry[entry._id]
          resolve(body) 
        })
        .catch( e => {
          // console.log('GET BLOCK BODY ERROR',e)
          resolve(false)
        })
      }
    })
  }

  fetchBlockFromDB(blockNumber){
    return new Promise(async (resolve)=>{
      if(typeof blockNumber == 'number') blockNumber = blockNumber.toString()
      let block = await this.getHeaderFromDB(blockNumber)
      if(block){
        let blockBody = await this.getBodyFromDB(block.hash)
        if(blockBody){
          block.transactions = blockBody

          if(blockBody.actions){
            block.actions = JSON.parse(JSON.stringify(blockBody.actions))
            delete blockBody.actions
            resolve(block)
          }else{
            resolve(block)
          }
        }else{
          // console.log('ERROR Could not get block body')
          resolve(false)
        }
      }else{
        // console.log('ERROR Could not get block header')
        resolve(false)
      }
    })
  }

  getTransactionFromDB(hash){
    return new Promise(async (resolve)=>{
      let lastBlock = this.getLatestBlock()
      let found = false;
      for await(var block of this.chain){
        if(block.txHashes){
          if(block.txHashes.includes(hash)){
            let body = await this.fetchBlockFromDB(block.blockNumber)
            if(body){
              let transaction = body.transactions[hash];
              found = true
              resolve(transaction)
            }else{
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

  getActionFromDB(hash){
    return new Promise(async (resolve)=>{
      let lastBlock = this.getLatestBlock()
      let found = false;
      for await(var block of this.chain){
        if(block.actionHashes){
          if(block.actionHashes.includes(hash)){
            let body = await this.fetchBlockFromDB(block.blockNumber)
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
      this.chainDB.get(blockNumber.toString())
      .then(async (headerEntryFound)=>{
        this.chainDB.remove(headerEntryFound._id, headerEntryFound._rev)
        .then((deleted)=>{
          resolve(deleted)
        })
        .catch( e => {
          console.log('HEADER DELETE ERROR', e)
          resolve(false)
        })
      })
      .catch( e => {
        console.log('HEADER GET ERROR', e)
        resolve(false)
      })
    })
  }

  removeBodyFromDB(hash){
    return new Promise(async (resolve)=>{
      this.chainDB.get(hash)
      .then(async (bodyEntryFound)=>{
        this.chainDB.remove(bodyEntryFound._id, bodyEntryFound._rev)
        .then((deleted)=>{
          resolve(deleted)
        })
        .catch( e => {
          console.log('BODY DELETE ERROR', e)
          resolve(false)
        })
      })
      .catch( e => {
        console.log('BODY GET ERROR', e)
        resolve(false)
      })
    })
  }

  removeBlockFromDB(block){
    return new Promise(async (resolve)=>{
      
      let headerDeleted = await this.removeHeaderFromDB(block.blockNumber)
      if(headerDeleted){
        let bodyDeleted = await this.removeHeaderFromDB(block.hash)
        if(bodyDeleted){
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
        let deleted = await this.removeBlockFromDB(existingBlock)
        if(deleted){
          let added = await this.putBlockToDB(newBlock)
          if(added){
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

  createCoinbaseTransaction(publicKey, blockHash){
    
    return new Promise(async (resolve, reject)=>{
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
            if(action.fromAccount.ownerKey == address){
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
    let previousBlock = this.chain[block.blockNumber - 1] || this.getLatestBlock()
    let previousTimestamp = previousBlock.timestamp
    if(timestamp > previousTimestamp && timestamp < (Date.now() + twentyMinutesInTheFuture) ){
      return true
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
      var isValidTimestamp = this.validateBlockTimestamp(block)
      var hasOnlyOneCoinbaseTx = await this.validateUniqueCoinbaseTx(block)
      var isValidChallenge = this.validateChallenge(block);
      var areTransactionsValid = this.validateBlockTransactions(block)
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

      if(!hasOnlyOneCoinbaseTx){
        logger('ERROR: Block must contain only one coinbase transaction')
      }

      // if(!isValidDifficulty){
      //   logger('ERROR: Recalculated difficulty did not match block difficulty')
      // }

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
          txHashes:Object.keys(block.transactions),
          minedBy:block.minedBy,
        }

        if(block.actions){
          header.actionHashes = Object.keys(block.actions)
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
    console.log(header.hash)
      console.log(RecalculateHash(header))
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

  // rollBackBlocks(blockIndex){  //Tool to roll back conflicting blocks - To be changed soon
  //   if(typeof blockIndex == 'number'){
  //     var orphanedBlocks = [];
  //     let length = this.chain.length;
  //     let numberOfBlocks = length - blockIndex;
  //     orphanedBlocks = this.chain.splice(-1, numberOfBlocks);
  //     orphanedBlocks.forEach((block)=>{})

  //     return orphanedBlocks;
  //   }
  // }

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

      let errors = {}
      let totalBlockNumber = this.getLatestBlock().blockNumber
      let newLastBlock = this.chain[number];
      let numberOfBlocksToRemove = totalBlockNumber - number;
      let blocks = this.chain.slice(number + 1, number + 1 + numberOfBlocksToRemove)// this.chain.chain.splice(number + 1, numberOfBlocksToRemove)
      
      let rolledBack = await this.balance.rollback(number)
      if(rolledBack.error) throw new Error(rolledBack.error)
      
      let newestToOldestBlocks = blocks.reverse()
      let actionHashes = await collectActionHashes(newestToOldestBlocks)

      if(actionHashes.length > 0){
        for await(var hash of actionHashes){
          let action = await this.getActionFromDB(hash);
          if(action){
            if(action.type == 'contract'){
              if(action.task == 'call'){
                let contractName = action.data.contractName;
                let rolledBack = await this.contractTable.rollbackState(contractName, action)
                if(rolledBack.error) errors[hash] = rolledBack.error

              }else if(action.task == 'deploy'){
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
      let removed = this.chain.splice(number + 1, numberOfBlocksToRemove)
      logger('Rolled back to block ', number)
      if(Object.keys(errors).length > 0) resolve({error:errors})
      else resolve(true)
    })
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

            resolve(true)

          }else if(isMiningReward){
            
            let isValidCoinbaseTransaction = await this.validateCoinbaseTransaction(transaction)

            if(isValidCoinbaseTransaction.error) resolve({error:isValidCoinbaseTransaction.error})

            if(isValidCoinbaseTransaction && !isValidCoinbaseTransaction.error){
              resolve(true)
            }

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

  async validateCoinbaseTransaction(transaction){
    return new Promise(async (resolve, reject)=>{
      if(transaction){

        try{
  
          let isChecksumValid = this.validateChecksum(transaction);
          // let fiveBlocksHavePast = await this.waitFiveBlocks(transaction);
          let isAttachedToMinedBlock = await this.coinbaseTxIsAttachedToBlock(transaction);
          // let isAlreadyInChain = await this.getTransactionFromChain(transaction.hash);
          let hasTheRightMiningRewardAmount = transaction.amount == (this.miningReward + this.calculateTransactionMiningFee(transaction));
          let transactionSizeIsNotTooBig = Transaction.getTransactionSize(transaction) < this.transactionSizeLimit //10 Kbytes
                  
          if(!isChecksumValid) resolve({error:'REJECTED: Transaction checksum is invalid'});
          if(!hasTheRightMiningRewardAmount) resolve({error:'REJECTED: Coinbase transaction does not contain the right mining reward: '+ transaction.amount});
          // if(isAlreadyInChain) Mempool.deleteCoinbaseTransaction(transaction)
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

  executeActionBlock(block){
    return new Promise(async (resolve)=>{
      if(block){
        let actions = block.actions
        let hashes = Object.keys(actions);
        let errors = {}
        for(var hash of hashes){
          let action = actions[hash]

          let result = await this.handleAction(action, block.blockNumber)
          if(result.error){
            errors[action.hash] = result.error
          }
        }

        if(Object.keys(errors) > 0){
          resolve({errors:errors})
        }else{
          resolve(true)
        }
        
      }else{
        resolve({error:'Missing action block'})
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
            let executed = await this.executeAction(action, blockNumber)
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

          if(action.task == 'call'){
            let executed = await this.testExecuteAction(action, blockNumber)
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
        resolve({error:'ACTION ERROR: Could not get contract account'})
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

  executeAction(action, blockNumber){
    return new Promise(async (resolve)=>{
      try{
        let account = await this.accountTable.getAccount(action.fromAccount)
        if(account){
          let contract = await this.contractTable.getContract(action.data.contractName)
          if(contract){
            if(contract.error) resolve({error:contract.error})
            
            let isExternalFunction = contract.contractAPI[action.data.method]
            if(!isExternalFunction) resolve({error:'Method call is not part of contract API'})
            else{
              let contractState = await this.contractTable.getState(action.data.contractName)
              if(!contractState) resolve({error:'Could not find contract state'})
    
              let initParams = JSON.parse(contract.initParams)
    
              let method = action.data.method
              let params = action.data.params

    
              let instruction = `
                let failure = ''
                let fail = require('fail')

                async function execute(){
                  let instance = {};
                  
                  try{
                    const commit = require('commit')
                    const save = require('save')
                    
                    let callerAccountString = '${JSON.stringify(account)}'
                    let callerAccount = JSON.parse(callerAccountString)

                    let paramsString = '${JSON.stringify(params)}'
                    let params = JSON.parse(paramsString)

                    let initParamsString = '${JSON.stringify(initParams)}'
                    let initParams = JSON.parse(initParamsString)

                    let currentStateString = '${JSON.stringify(contractState)}'
                    let currentState = JSON.parse(currentStateString)

                    let actionString = '${JSON.stringify(action)}'
                    let action = JSON.parse(actionString);
                    params.callingAction = action

                    instance = new ${action.data.contractName}(initParams)

                    instance.setState(currentState)
                    console.log('Account:', callerAccount.name)
                    let result = await instance['${method}'](params, callerAccount.name)
                    save(instance.state)
                    commit(result)
                    
                    
                  }catch(err){
                    failure = err
                  }
                    
                  
                }
    
                execute()
                .then(()=>{
                  if(failure) throw new Error(failure.message)
                  fail(e)
                })
                .catch((e)=>{
                  fail(e)
                })
                
              `
                let result = await callRemoteVM(contract.code + instruction)
                
                if(result.error){
                  resolve({error:result.error})
                }else{
                  if(result.state){
                    this.contractTable.updateContractState(action.data.contractName, result.state, action, blockNumber)
                    
                    resolve(result.value)
                  }else{
                    resolve({error:'An error occurred'})
                  }
                }
              }
            
              
          }else{
            resolve({error:'Unkown contract name'})
          }
          
        }else{
          resolve({error:'Unkown account name'})
        }
      }catch(e){
        resolve({error:e.message})
      }



    })
  }

  testExecuteAction(action, blockNumber){
    return new Promise(async (resolve)=>{
      try{
        let account = await this.accountTable.getAccount(action.fromAccount)
        if(account){
          let contract = await this.contractTable.getContract(action.data.contractName)
          if(contract){
            if(contract.error) resolve({error:contract.error})
            
            let contractHasReadOnly = contract.contractAPI.readOnly;
            let isReadOnly = false;
            if(contractHasReadOnly){
              isReadOnly = contract.contractAPI.readOnly[action.data.method];
            }
            
            let isExternalFunction = contract.contractAPI[action.data.method]
            if(!isExternalFunction && !isReadOnly){
              resolve({error:'Method call is not part of contract API'})
            }else{
              let contractState = await this.contractTable.getState(action.data.contractName)
              if(!contractState) resolve({error:'Could not find contract state'})

              let initParams = JSON.parse(contract.initParams)
    
              let method = action.data.method
              let params = action.data.params

    
              let instruction = `
                let failure = ''
                let fail = require('fail')

                async function execute(){
                  let instance = {};
                  
                  try{
                    const commit = require('commit')
                    const save = require('save')
                    
    
                    let actionString = '${JSON.stringify(action)}'
                    let paramsString = '${JSON.stringify(params)}'
                    let initParamsString = '${JSON.stringify(initParams)}'
                    let callerAccountString = '${JSON.stringify(account)}'
                    let currentStateString = '${JSON.stringify(contractState)}'
                    
                    let callerAccount = JSON.parse(callerAccountString)
                    let params = JSON.parse(paramsString)
                    let initParams = JSON.parse(initParamsString)
                    let currentState = JSON.parse(currentStateString)
                    let action = JSON.parse(actionString);
                    params.callingAction = action
                    instance = new ${action.data.contractName}(initParams)
                    await instance.setState(currentState)
                    let result = await instance['${method}'](params, callerAccount.name)
                    save(instance.state)
                    commit(result)
                    
                    
                  }catch(err){
                    failure = err
                  }
                    
                  
                }
    
                execute()
                .then(()=>{
                  if(failure) throw new Error(failure.message)
                  fail(e)
                })
                .catch((e)=>{
                  fail(e)
                })
                
              `
                let result = await callRemoteVM(contract.code + instruction)
                
                if(result.error){
                  resolve({error:result.error})
                }else{
                  resolve(result.value)
                }
            }

          }else{
            resolve({error:'Unkown contract name'})
          }
          
        }else{
          resolve({error:'Unkown account name'})
        }
      }catch(e){
        resolve({error:e.message})
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
       if(sha256(
                transaction.fromAddress+ 
                transaction.toAddress+ 
                transaction.amount+ 
                transaction.data+ 
                transaction.timestamp
                ) === transaction.hash){
        return true;
      }
    }
    return false;
  }

  /**
    Checks if the action hash matches its content
    @param {object} $transaction - Action to be inspected
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
  getBlockFromDB(blockNumberString){
    return new Promise(async(resolve)=>{
      if(!blockNumberString) resolve({error:'Block number is required to fetch block from db'})
      let blockContainer = await this.chainDB.get(blockNumberString)
      .catch(e => { resolve({error:e}) })
      if(blockContainer){
        let block = blockContainer[blockNumberString]
        resolve(block)
      }else{
        resolve({error:`Could not find block ${blockNumberString}`})
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
      this.loadBlocks()
      .then(async (loaded)=>{
        if(loaded){

          // let accountsLoaded = await this.accountTable.loadAllAccountsFromFile();
          // if(accountsLoaded){
          //   resolve(true)
          // }else{
          //   reject('ERROR: Could not load account table')
          // }
          
          let savedBalances = await this.balance.loadAllStates()
          if(savedBalances){
            this.balance.states = savedBalances.states
            this.balance.history = savedBalances.history
            resolve(true)
          }else{
            reject('ERROR: Could not load balance states')
          }
          
        }else{
          reject('Could not load blocks')
        }
        
      })
      .catch(e=>{
        reject(e)
      })
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
      this.chainDB.get('0')
      .then(async (genesisBlock)=>{
        if(genesisBlock){

          let lastBlockString = await readFile('./data/lastBlock.json')
          if(lastBlockString){
            let lastBlock = JSON.parse(lastBlockString)
            logger('Loaded last known block')
            //Loading all saved blocks up to last saved one
            for(var blockNumber=0; blockNumber <= lastBlock.blockNumber; blockNumber++){

              if(typeof blockNumber == 'number') blockNumber = blockNumber.toString()
              
              let block = await this.getBlockFromDB(blockNumber)
              if(block.error) reject(block.error)

              //Could plug in balance loading from DB here

              this.chain.push(block)
              if(blockNumber == lastBlock.blockNumber){
                logger(`Finished loading ${parseInt(blockNumber) + 1} blocks`) 
                resolve(true)
              }
            }
            
          }else{
            logger('Could not find lastBlock.json. Starting a new blockchain ')
            resolve(true)
          }
        }else{
          reject('ERROR: Could not find genesisBlock')
        }
      }) 
      .catch(async (e)=>{  //Has not been added to database, must be new blockchain
        
        logger('Genesis Block has not been created yet')
        let genesisBlock = await this.loadGenesisFile()
        logger('Loaded genesis block from config file')
        if(genesisBlock.error) reject(genesisBlock.error)

        this.balance.states = genesisBlock.states;
        let saved = await this.balance.saveStates()

        this.genesisBlockToDB(genesisBlock)
        .then(async (added)=>{
          if(added){

            logger('Added genesis block to blockchain database')
            this.chain.push(genesisBlock)
            let lastBlock = await writeToFile(this.getLatestBlock(), './data/lastBlock.json')
            if(!lastBlock){
              reject('ERROR: Could not save blockchain state')
            }
            resolve(true);

          }else{
            logger(added)
            reject('Error adding genesis block to db')
          }
        })
        .catch(e => {
          logger(e)
          reject(e)
        })
        

      })

        

      
    })
    
  }

  /**
   * Saves only the last block to JSON file
   */
  save(){
    return new Promise(async (resolve)=>{
      let lastBlock = await writeToFile(this.getLatestBlock(), './data/lastBlock.json')
      
      if(!lastBlock){
        logger('ERROR: Could not save blockchain state')
        resolve(false)
      }
      resolve(true);
    })
  }

}

module.exports = Blockchain;

