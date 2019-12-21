

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
        this.previousBlock = false
        this.minerReady = false;
        this.minerStarted = false;
        this.miningReward = 50;
        this.blockNumbersMined = {}
        this.pool = {
          pendingTransactions:{},
          pendingActions:{}
        }
        this.beingProcessed = {
          transaction:{},
          actions:{}
        }
    }

    async initWallet(){
      this.wallet = await this.manager.loadByWalletName(this.keychain.name)
      if(!this.wallet) throw new Error('ERROR: Could not load wallet')
    }

    log(message, arg){
      if(this.verbose){
        if(arg) logger(message, arg)
        else logger(message)
      }else{
        //nothing
      }
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
          this.log('Miner connected to ', url)
          this.run()
        })
        this.socket.on('latestBlock', (block)=>{
            this.previousBlock = block
        })
        this.socket.on('startMining', (rawBlock)=>{
            if(rawBlock.error) console.log(rawBlock.error)
            else if(rawBlock){
              if(!this.minerStarted){
                this.start(rawBlock)
              }
            }
            
        })
        this.socket.on('transactionSent', ()=>{
          this.socket.emit('isNewBlockReady', this.previousBlock)
        })
        this.socket.on('actionSent', ()=>{
          this.socket.emit('isNewBlockReady', this.previousBlock)
        })
        
        this.socket.on('stopMining', ()=>{ this.pause() })

        this.socket.on('error', error => console.log('ERROR',error))
        this.socket.on('disconnect', ()=>{
          this.log('Connection to node dropped')
          this.pause()
        })
      }
    }

    async start(rawBlock){
        
          
        let block = await this.prepareBlockForMining(rawBlock);
        if(block){
          if(this.previousBlock.hash !== block.hash){
            if(!this.minerStarted){
              this.minerStarted = true
              this.log('Starting to mine next block')
              this.log('Number of transactions being mined: ', Object.keys(block.transactions).length)
              this.log('Number of actions being mined: ', Object.keys(block.actions).length)
              this.log('Current difficulty:', BigInt(parseInt(block.difficulty, 16)))
              this.log('At difficulty: ', parseInt(block.difficulty, 16))
              let success = await block.mine(block.difficulty);
              if(success){
                this.pause()
                block.endMineTime = Date.now()
                block = success;
                this.successMessage(block)
                this.socket.emit('newBlock', block)
                this.minerStarted = false;
                this.previousBlock = block;
                // this.blockNumbersMined[block.blockNumber] = true
                
              }else{
                this.pause()
                this.log('Mining unsuccessful')
                this.minerStarted = false;
              }
            }else{
              this.log('Miner already started')
            }
          }else{
            this.log('Will not mine the same block twice')
          }
        }else{
          this.log('Could not mine. Miner does not have next block')
        }

      }


    run(){
      // let stayUpdated = setInterval(()=>{
        
      //   if(!this.minerStarted){
      //     this.socket.emit('getLatestBlock')
      //     this.socket.emit('isNewBlockReady', this.previousBlock)
      //   }
      // }, 500)
    }

    pause(){
      this.log('Mining interrupted')
        
      if(process.ACTIVE_MINER){
        process.ACTIVE_MINER.kill()
        process.ACTIVE_MINER = false;
      }
      
      this.minerStarted = false;
    }

    async createCoinbase(){
      if(this.wallet){
        let coinbase = new Transaction({
          fromAddress:'coinbase',
          toAddress:this.wallet.publicKey,
          amount:this.miningReward
        })
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

    // async buildNewBlock(){

    //   let transactions = JSON.parse(JSON.stringify(this.pool.pendingTransactions)) 
    //   let actions = JSON.parse(JSON.stringify(this.pool.pendingActions))
      
    //   if(this.previousBlock){
    //     if(Object.keys(transactions).length > 0){
    //       if(!this.buildingBlock){
  
    //         this.buildingBlock = true
    //         this.pool.pendingTransactions = {}
    //         this.pool.pendingActions = {}
  
    //         transactions = await this.orderTransactionsByTimestamp(transactions)
  
    //         if(!this.nextCoinbase){
    //           this.nextCoinbase = await this.createCoinbase()
    //           transactions[this.nextCoinbase.hash] = this.nextCoinbase
    //         }
    //         let transactionsToAdd = JSON.parse(JSON.stringify(transactions))
    //         let block = new Block(Date.now(), transactionsToAdd, actions);
    //         block.coinbaseTransactionHash = this.nextCoinbase.hash
    //         this.nextBlock = block
  
    //         block.startMineTime = Date.now()
    //         block.blockNumber = this.previousBlock.blockNumber + 1;
    //         block.previousHash = this.previousBlock.hash;
  
    //         let difficulty = new Difficulty(this.genesis)
    //         block.difficulty = difficulty.setNewDifficulty(this.previousBlock, block);
    //         block.challenge = difficulty.setNewChallenge(block)
    //         block.totalDifficulty = this.calculateTotalDifficulty(block)
  
    //         block.minedBy = this.wallet.publicKey;
            
    //         this.buildingBlock = false
    //         return block;
    //       }else{
    //         return this.nextBlock
    //       }
    //     }
    //   }
      
    // }

    async prepareBlockForMining(rawBlock){
        
        if(rawBlock && rawBlock.blockNumber > this.previousBlock.blockNumber){
          let coinbase = await this.createCoinbase()
          rawBlock.transactions[coinbase.hash] = coinbase
          let block = new Block(Date.now(), rawBlock.transactions, rawBlock.actions, this.previousBlock.hash, rawBlock.blockNumber)
          block.startMineTime = Date.now()
          block.coinbaseTransactionHash = coinbase.hash
          //Set difficulty level
          let difficulty = new Difficulty(this.genesis)
          block.difficulty = difficulty.setNewDifficulty(this.previousBlock, block);
          block.challenge = difficulty.setNewChallenge(block)
          block.totalDifficulty = this.calculateTotalDifficulty(block)
          block.minedBy = this.wallet.publicKey;
          return block
        }else{
          return false
        }

        
    }

    // orderTransactionsByTimestamp(transactions){
    //   return new Promise((resolve)=>{
    //     if(typeof transactions == 'object'){
    //       this.log('Ordering transactions by timestamp')
    //       let txHashes = Object.keys(transactions);
    //       let orderedTransaction = {};
    //       let txAndTimestamp = {};
  
    //       if(txHashes){
    //         txHashes.forEach( hash =>{
    //           let transaction = transactions[hash];
    //           txAndTimestamp[transaction.timestamp] = hash;
    //         })
  
    //         let timestamps = Object.keys(txAndTimestamp);
    //         timestamps.sort(function(a, b){return a-b});
    //         timestamps.forEach( timestamp=>{
    //           let hash = txAndTimestamp[timestamp];
    //           let transaction = transactions[hash];
    //           orderedTransaction[hash] = transaction;
    //         })
  
    //         resolve(orderedTransaction)
  
    //       }
  
    //   }
    //   })

    // }

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
      if(this.verbose){
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

    

}

module.exports = Miner;