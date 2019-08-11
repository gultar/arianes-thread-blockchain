

const Block = require('../block');
const Transaction = require('../transaction');
const WalletManager = require('../walletManager')
const { logger, displayTime } = require('../../tools/utils');
const { isValidBlockJSON } = require('../../tools/jsonvalidator');
const chalk = require('chalk');
const genesis = require('../../tools/getGenesis')
const { setNewDifficulty, setNewChallenge, Difficulty } = require('../challenge')
const ioClient = require('socket.io-client');
class Miner{
    constructor(params){
        this.address = params.address;
        this.keychain = params.keychain;
        this.verbose = params.verbose;
        this.wallet = {}
        this.genesis = genesis
        this.manager = new WalletManager()
        this.previousBlock = {}
        this.minerReady = false;
        this.minerStarted = false;
        this.miningReward = 50;
        this.pool = {
          pendingTransactions:{},
          pendingActions:{}
        }
    }

    async initWallet(){
      this.wallet = await this.manager.loadByWalletName(this.keychain.name)
      if(!this.wallet) throw new Error('ERROR: Could not load wallet')
    }

    connect(url){
      
      this.initWallet()
      if(url){
        let config = {
          'query':
            {
              token: 'InitMiner',
            }
        }
        this.socket = ioClient(url, config)
        this.socket.on('connect', ()=>{
          logger('Miner connected to ', url)
          this.getTransactionsToMine()
        })

        this.socket.on('txHashList', (list)=>{
          if(list){
              list.forEach(hash=>{
                  this.socket.emit('getTx', hash)
              })
          }
        })
        this.socket.on('tx', (tx)=>{
            if(tx){
              this.pool.pendingTransactions[tx.hash] = tx;
            }
        })

        this.socket.on('actionHashList', (list)=>{
            if(list){
                list.forEach(hash=>{
                    this.socket.emit('getAction', hash)
                })
            }
        })
        this.socket.on('action', (action)=>{
            if(action){
              this.pool.pendingActions[action.hash] = action;
            }
        })
        this.socket.on('newTransactions', (transactions)=>{
          if(transactions){
            this.pool.pendingTransactions = transactions
            this.getActionsToMine()
            
          }
        })
        this.socket.on('newActions', (actions)=>{
          if(actions){
            this.pool.pendingActions = actions
          }
        })
        this.socket.on('latestBlock', (block)=>{
          this.previousBlock = block;
        })
        this.socket.on('stopMining', ()=>{ this.pause() })
        this.socket.on('startMining', ()=>{ 
          if(!this.minerStarted){
            this.start()
          }
        })
        this.socket.on('error', error => console.log('ERROR',error))
        this.socket.on('disconnect', ()=>{
          logger('Connection to node dropped')
          this.pause()
        })
      }
    }

    sizeOfPool(){
      return Object.keys(this.pool.pendingTransactions).length
    }

    sizeOfActionPool(){
      return Object.keys(this.pool.pendingActions).length
    }

    async start(){
       
        if(this.readyToMine){
          this.minerStarted = true
          
          let block = await this.buildNewBlock();
          if(block){
            logger('Starting to mine next block')
            logger('Number of transactions being mined: ', Object.keys(this.pool.pendingTransactions).length)
            logger('Current difficulty:', BigInt(parseInt(block.difficulty, 16)))
            logger('At difficulty: ', parseInt(block.difficulty, 16))
            let success = await block.mine(block.difficulty);
            if(success){
              block.endMineTime = Date.now()
              block = success;
              this.successMessage(block)
              this.socket.emit('newBlock', block)
              this.pause()
            }else{
              logger('Mining unsuccessful')
              this.minerStarted = false;
              
            }
          }else{
            this.minerStarted = false
          }
        }

      }

    getTransactionsToMine(){
      this.transactionUpdate = setInterval(()=>{
        if(!this.buildingBlock && !this.mining && !this.minerStarted){
          if(this.sizeOfPool() > 0){
            if(!this.readyToMine){
              this.socket.emit('isReady')
              this.readyToMine = true
            }
            
          }else{
            this.socket.emit('fetchTransactions')
          }
        }
        
      }, 500)
    }

    getActionsToMine(){
      return new Promise((resolve)=>{
        let timedOut = setTimeout(()=>{
          this.socket.off('newActions')
          resolve(false)
        }, 2000)
        this.socket.emit('fetchActions')
        this.socket.on('newActions', (actions)=>{
          if(actions){
            this.pool.pendingActions = actions;
            logger(`Found actions ${this.sizeOfActionPool()} to mine`)
            clearTimeout(timedOut)
            this.socket.off('newActions')
            resolve(true)
          }else{
            resolve(false)
          }
        })
      })
    }

    updateTransactions(){
      return new Promise(async (resolve)=>{
        let lastHash = '';
        let list = await this.getTxList();
        if(list){
          
          for(var i=0; i < list.length; i++){
            if(i == list.length -1){
              lastHash = list[i]
            }

            this.socket.emit('getTx', list[i])
          }
          this.socket.on('tx', (tx)=>{
            if(tx){
                this.pool.pendingTransactions[tx.hash] = tx;
                if(tx.hash == lastHash){
                  this.socket.off('tx')
                  resolve(true)
                }
            }
            
          })
        }else{
          resolve(false)
        }
      })
      
    }

    updateActions(){
      return new Promise(async (resolve)=>{
        let lastHash = '';
        let list = await this.getActionList();
        if(list && list.length > 0){
          for(var i=0; i < list.length; i++){
            if(i == list.length -1){
              lastHash = list[i]
            }

            this.socket.emit('getAction', list[i])
          }
          this.socket.on('action', (action)=>{
            if(action){
                this.pool.pendingActions[action.hash] = action;
                if(action.hash == lastHash){
                  this.socket.off('action')
                  resolve(true)
                }
            }else{
              resolve(false)
            }
            
          })
        }else{
          resolve(false)
        }
      })
      
    }

    getTxList(){
      return new Promise((resolve)=>{
        this.socket.emit('getTxHashList')
        this.socket.on('txHashList', (list)=>{
            if(list){
                this.socket.off('txHashList')
                resolve(list)
            }else{
              resolve(false)
            }
        })
      })
    }

    getActionList(){
      return new Promise((resolve)=>{
        this.socket.emit('getActionHashList')
        this.socket.on('actionHashList', (list)=>{
            if(list){
                this.socket.off('actionHashList')
                resolve(list)
            }else{
              resolve(false)
            }
        })
      })
    }

    pause(){
      
      if(process.ACTIVE_MINER){
        logger('Stopping miner')
        process.ACTIVE_MINER.kill()
        process.ACTIVE_MINER = false;
        this.minerStarted = false;
        this.pool.pendingTransactions = {}
        this.pool.pendingActions = {}
        this.nextBlock = false;
        this.nextCoinbase = false;
        this.readyToMine = false;
        
      }
      // if(this.minerLoop) clearInterval(this.minerLoop)
    }

    async createCoinbase(){
      if(this.wallet){
        
        let coinbase = new Transaction('coinbase', this.wallet.publicKey, this.miningReward)
        let unlocked = await this.wallet.unlock(this.keychain.password)
        
        if(unlocked){
          let signature = await this.wallet.sign(coinbase.hash);
          if(signature){
            coinbase.signature = signature;
            return coinbase
          }else{
            throw new Error('Could not sign coinbase transaction')
          }
        }else{
          throw new Error('Could not unlock wallet');
        }
        
      }else{
        throw new Error('Cannot create coinbase transaction, no wallet available')
      }
      
      
    }

    async buildNewBlock(){
      let transactions = this.pool.pendingTransactions
      let actions = this.pool.pendingActions
      
      if(Object.keys(transactions).length > 0){
        if(!this.buildingBlock){

          this.buildingBlock = true

          transactions = this.orderTransactionsByTimestamp(transactions)

          if(!this.nextCoinbase){
            this.nextCoinbase = await this.createCoinbase()
            transactions[this.nextCoinbase.hash] = this.nextCoinbase
          }
          let transactionsToAdd = JSON.parse(JSON.stringify(transactions))
          let block = new Block(Date.now(), transactionsToAdd, actions);
          block.coinbaseTransactionHash = this.nextCoinbase.hash
          this.nextBlock = block

          block.startMineTime = Date.now()
          block.blockNumber = this.previousBlock.blockNumber + 1;
          block.previousHash = this.previousBlock.hash;

          let difficulty = new Difficulty(this.genesis)
          block.difficulty = difficulty.setNewDifficulty(this.previousBlock, block);
          block.challenge = difficulty.setNewChallenge(block)
          block.totalDifficulty = this.calculateTotalDifficulty(block)

          block.minedBy = this.wallet.publicKey;
          
          this.buildingBlock = false
          return block;
        }else{
          return this.nextBlock
        }
      }
      
    }

    orderTransactionsByTimestamp(transactions){
      if(typeof transactions == 'object'){
          logger('Ordering transactions by timestamp')
          let txHashes = Object.keys(transactions);
          let orderedTransaction = {};
          let txAndTimestamp = {};
  
          if(txHashes){
            txHashes.forEach( hash =>{
              let transaction = transactions[hash];
              txAndTimestamp[transaction.timestamp] = hash;
            })
  
            let timestamps = Object.keys(txAndTimestamp);
            timestamps.sort(function(a, b){return a-b});
            timestamps.forEach( timestamp=>{
              let hash = txAndTimestamp[timestamp];
              let transaction = transactions[hash];
              orderedTransaction[hash] = transaction;
            })
  
            return orderedTransaction;
  
          }
  
      }
    }

    calculateTotalDifficulty(block){
      return (BigInt(parseInt(this.previousBlock.totalDifficulty, 16)) + BigInt(parseInt(block.difficulty, 16))).toString(16)
    }


    successMessage(block){
      function pad(n, width, z) {
        z = z || '0';
        n = n + '';
        let array = (new Array(width - n.length + 1)).join(z)
        return n.length >= width ? n :  '0x'+array + n;
      }
      console.log(chalk.cyan('\n********************************************************************'))
      console.log(chalk.cyan('* Block number : ')+block.blockNumber);
      console.log(chalk.cyan('* Block Hash : ')+ block.hash.substr(0, 25)+"...")
      console.log(chalk.cyan('* Previous Hash : ')+ block.previousHash.substr(0, 25)+"...")
      console.log(chalk.cyan("* Block successfully mined by : ")+block.minedBy)
      console.log(chalk.cyan('* Mined at: '), displayTime())
      console.log(chalk.cyan("* Challenge : "), pad(block.challenge, 64).substr(0, 25)+'...');
      console.log(chalk.cyan("* Block time : "), (block.endMineTime - block.startMineTime)/1000)
      console.log(chalk.cyan("* Nonce : "), block.nonce)
      console.log(chalk.cyan("* Difficulty : "), parseInt(block.difficulty, 16))
      console.log(chalk.cyan("* Total Difficulty : "), BigInt(parseInt(block.totalDifficulty, 16)))
      console.log(chalk.cyan('* Number of transactions in block : '), Object.keys(block.transactions).length)
      console.log(chalk.cyan('* Number of actions in block : '), Object.keys(block.actions).length)
      console.log(chalk.cyan('********************************************************************\n'))
    }

    

}

module.exports = Miner;