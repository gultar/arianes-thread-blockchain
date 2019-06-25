
const Mempool = require('../mempool');
const Block = require('../block');
const Blockchain = require('./blockchain');
const { logger } = require('../../tools/utils');
const { isValidBlockJSON } = require('../../tools/jsonvalidator');
const chalk = require('chalk');

class Miner{
    constructor(params){
        this.chain = params.chain;
        this.address = params.address;
        this.publicKey = params.publicKey;
        this.verbose = params.verbose;
        this.sendPeerMessage = params.sendPeerMessage
        this.serverBroadcast = params.serverBroadcast
        this.minerStarted = false;
        this.isMining = false;
        this.nodeIsDownloading = false;
        this.minerPaused = false;
        this.minerLoop = '';
    }

    start(callback){
      if(this.chain instanceof Blockchain){
          if(!this.minerStarted){
            this.minerStarted = true;
            this.minerLoop = setInterval(async ()=>{
                    if(!process.NODE_IS_DOWNLOADING){
                      let enoughTransactions = this.chain.hasEnoughTransactionsToMine();
                    
                      if(enoughTransactions && !this.isMining){
                          
                          this.isMining = true;
                          let block = await this.buildNewBlock();
  
                          clearInterval(this.minerLoop);
  
                          logger('Mining block number '+chalk.green(this.chain.chain.length));
                          logger('Number of pending transactions:', Mempool.sizeOfPool());
  
                          if(block){
                            let success = await this.chain.mineNextBlock(block, this.address, this.verbose);
                            this.minerPaused = true;
                            if(success){
                              let newBlock = success;
                              let isChainValid = this.chain.validateBlockchain();
                              
                              if(isChainValid){
                                
                                  let newBlockTransactions = newBlock.transactions;
                                  let newBlockActions = newBlock.actions
                                  Mempool.deleteTransactionsFromMinedBlock(newBlockTransactions);
                                  Mempool.deleteActionsFromMinedBlock(newBlockActions);
                                  this.chain.saveBlockchain();
                                  
                                  let coinbase = await this.chain.createCoinbaseTransaction(this.publicKey, this.chain.getLatestBlock().hash)
                                  
                                  if(coinbase){
                                      block.coinbaseTransactionHash = coinbase.hash;
                                  }else{
                                      logger('ERROR: An error occurred while creating coinbase transaction')
                                  }
                                  
                                  callback(block);
                                  
                              }else{
                                logger('ERROR: Chain is invalid')
                                this.unwrapBlock(block);
                                callback(false)
                              }
                                
                            }else{
                              logger('Mining unsuccessful')
                              this.unwrapBlock(block);
                              callback(false)
                            }
                          }else{
                            logger('ERROR: Block is undefined is invalid');
                            callback(false)
                          }
                          
                      }
                    }else{
                      logger('Node is downloading')
                    }

                   
            }, 1000)
        }
      }
          
    }

    resetMiner(){
      this.minerStarted = false;
      this.minerPaused = false;
      this.isMining = false;
    }

    async buildNewBlock(){
      let transactions = await this.getTransactions();
      if(transactions){
        let actions = Mempool.gatherActionsForBlock();
        let block = new Block(Date.now(), transactions, actions);
        return block;
      }else{
        logger('ERROR: Could not gather transactions')
      }
      
    }

    getTransactions(){
      return new Promise(async (resolve)=>{
        let transactionsGathered = await Mempool.gatherTransactionsForBlock();
        //Max 100?
        let validatedTransactions = await this.chain.validateTransactionsForMining(transactionsGathered);
        // let sortedTransactions = Mempool.orderTransactionsByTimestamp(validatedTransactions);
        if(validatedTransactions){
          resolve(validatedTransactions)
        }else{
          resolve(false);
        }
       
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

}

module.exports = Miner;