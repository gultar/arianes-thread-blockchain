

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
        this.clusterMiner = params.clusterMiner
        this.wallet = {}
        this.genesis = genesis
        this.manager = new WalletManager()
        this.previousBlock = false
        this.currentMinedBlock = false
        this.minerReady = false;
        this.minerStarted = false;
        this.miningReward = 50;
        this.requeryTime = 1000 // 1 second
        this.preparingBlock = false
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
          this.socket.emit('getLatestBlock')
          this.socket.emit('isNewBlockReady', this.previousBlock)

        })
        this.socket.on('latestBlock', (block)=>{
            this.previousBlock = block
            this.blockNumbersMined[this.previousBlock.blockNumber] = this.previousBlock.hash
        })
        this.socket.on('startMining', (rawBlock)=>{
            if(rawBlock.error) console.log(rawBlock.error)
            else if(rawBlock){
              if(!this.minerStarted){
                this.start(rawBlock)
              }
            }else{
              console.log('Could not receive rawBlock')
            }
            
        })
        this.socket.on('wait', ()=>{
          setTimeout(()=>{
            this.socket.emit('isNewBlockReady', this.previousBlock)
          },this.requeryTime)
        })
        this.socket.on('transactionSent', ()=>{
          this.socket.emit('isNewBlockReady', this.previousBlock)
          this.socket.emit('getLatestBlock')
        })
        this.socket.on('actionSent', ()=>{
          this.socket.emit('isNewBlockReady', this.previousBlock)
          this.socket.emit('getLatestBlock')
        })
        
        this.socket.on('stopMining', ()=>{ this.pause({ abort:true }) })

        this.socket.on('error', error => console.log('ERROR',error))
        this.socket.on('disconnect', ()=>{
          this.log('Connection to node dropped')
          this.blockNumbersMined = {}
          this.pause()
        })
      }
    }

    async start(rawBlock){
      
      let block = await this.prepareBlockForMining(rawBlock);
      if(block){
        if(this.previousBlock.hash !== block.hash && !this.blockNumbersMined[block.blockNumber]){
          if(!this.minerStarted){
            this.currentMinedBlock = block
            this.socket.emit('mining', block)
            this.minerStarted = true
            this.log('Starting to mine block '+block.blockNumber)
            this.log('Number of transactions being mined: ', Object.keys(block.transactions).length)
            this.log('Number of actions being mined: ', Object.keys(block.actions).length)
            this.log('Current difficulty:', BigInt(parseInt(block.difficulty, 16)))
            let success = false
            
            if(this.clusterMiner) success = await block.powerMine(block.difficulty)
            else success = await block.mine(block.difficulty);
            if(success){
              this.pause()
              block.endMineTime = Date.now()
              block = success;
              this.successMessage(block)
              this.socket.emit('newBlock', block)
              this.minerStarted = false;
              this.previousBlock = block;
              this.socket.emit('miningOver')
              this.blockNumbersMined[block.blockNumber] = block.hash
              
            }else{
              
              this.log('Mining unsuccessful')
              this.socket.emit('miningOver')
              this.socket.send('newBlock', { failed:block })
              this.minerStarted = false;
              this.pause()
            }
          }else{
            this.log('Miner already started')
          }
        }else{
          this.log('Will not mine the same block twice')
          this.socket.emit('getNewBlock')
          this.socket.emit('miningOver')
        }
      }else{
        this.log('Could not mine. Miner does not have next block')
        this.socket.emit('getNewBlock')
        this.socket.emit('miningOver')
      }

    }

    pause(abort=false){
      this.log('Mining interrupted')
      if(process.ACTIVE_MINER){
        process.ACTIVE_MINER.kill()
        process.ACTIVE_MINER = false;
      }
      if(process.WORKER_POOL && process.WORKER_POOL.length >0){
        if(abort) process.STOP_WORKERS({ abort:true })
        else process.STOP_WORKERS({ stop:true })
      }
      this.socket.send('newBlock', { failed:this.previousBlock })
      this.minerStarted = false;
      this.socket.emit('getNewBlock')
      this.socket.emit('miningOver')
      this.socket.emit('miningCancelled', this.currentMinedBlock)
      // clearInterval(this.routine)
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


    async prepareBlockForMining(rawBlock){
        
        if(rawBlock && rawBlock.blockNumber > this.previousBlock.blockNumber && !this.preparingBlock){
          this.preparingBlock = true
          let coinbase = await this.createCoinbase()
          rawBlock.transactions[coinbase.hash] = coinbase
          let block = new Block(Date.now(), rawBlock.transactions, rawBlock.actions, rawBlock.previousHash, rawBlock.blockNumber)
          block.startMineTime = Date.now()
          block.coinbaseTransactionHash = coinbase.hash
          //Set difficulty level
          let difficulty = new Difficulty(this.genesis)
          block.difficulty = difficulty.setNewDifficulty(this.previousBlock, block);
          block.challenge = difficulty.setNewChallenge(block)
          block.totalDifficulty = this.calculateTotalDifficulty(block)
          block.minedBy = this.wallet.publicKey;
          this.preparingBlock = false
          return block
        }else{
          return false
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
      if(this.verbose){
        console.log(chalk.cyan('\n********************************************************************'))
        console.log(chalk.cyan('* Block number : ')+block.blockNumber);
        console.log(chalk.cyan('* Block Hash : ')+ block.hash.substr(0, 25)+"...")
        console.log(chalk.cyan('* Previous Hash : ')+ block.previousHash.substr(0, 25)+"...")
        console.log(chalk.cyan("* Block successfully mined by : ")+block.minedBy)
        console.log(chalk.cyan('* Mined at: '), displayTime())
        console.log(chalk.cyan("* Challenge : "), pad(block.challenge, 64).substr(0, 25)+'...');
        console.log(chalk.cyan("* Block time : "), (block.timestamp - this.previousBlock.timestamp)/1000)
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