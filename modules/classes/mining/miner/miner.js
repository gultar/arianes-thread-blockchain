const { parentPort, workerData } = require('worker_threads')
const Block = require('../../blockchain/block');
const Transaction = require('../../transactions/transaction');
const WalletManager = require('../../wallets/walletManager')
const { logger, displayTime } = require('../../../tools/utils');
const { isValidBlockJSON } = require('../../../tools/jsonvalidator');
const chalk = require('chalk');
const genesis = require('../../../tools/getGenesis')
const { Difficulty } = require('../challenge')
const ioClient = require('socket.io-client');

class Miner{
    constructor({ keychain, numberOfCores, miningReward, verbose }){
        //Walletname and password
        this.keychain = keychain;
        //Number of mining cores
        this.numberOfCores = numberOfCores
        //Wallet
        this.wallet = {}
        this.manager = new WalletManager()
        //Genesis config
        this.genesis = genesis
        this.miningReward = miningReward || genesis.miningReward || 50
        //block management
        this.previousBlock = {}
        this.currentBlock = {}
        this.verbose = verbose
        //state management
        this.preparingBlock = false
        this.isMining = false
        //Client socket
        this.socket = {}
    }

    connect(url){
        if(!url) throw new Error('Valid URL is Required')
        
        let config = {
          query:
              {
                token: 'InitMiner',
              }
        }
        this.socket = ioClient(url, config)
        this.socket.on('connect', async ()=>{
            this.log('Miner connected to ', url)
            await this.initWallet()
            this.socket.emit('isAvailable')
        })
        this.socket.on('disconnect', async ()=>{
          this.socket.close()
          process.exit()
        })
        this.socket.on('previousBlock', (block)=> this.previousBlock = block)
        this.socket.on('rawBlock', async (rawBlock)=> await this.start(rawBlock))
        this.socket.on('stopMining', async ()=> await this.stop())
    }

    log(...message){
        if(this.verbose){
            logger(...message)
        }
    }

    async initWallet(){
        this.wallet = await this.manager.loadByWalletName(this.keychain.name)
        if(!this.wallet) throw new Error(`ERROR: Could not load wallet ${this.keychain.name}`)
    }

    async stop(abort=false){
        this.log('Mining interrupted')
        if(process.WORKER_POOL && process.WORKER_POOL.length >0){
            if(abort) process.STOP_WORKERS({ abort:true })
            else process.STOP_WORKERS({ stop:true })
        }
        this.socket.emit('isStopped')
    }

    async start(rawBlock){
        this.socket.emit('isPreparing')
        let block = await this.prepareBlockForMining(rawBlock);
        if(block){
            this.socket.emit('isMining')

            this.log('Starting to mine block '+block.blockNumber)
            this.log('Number of transactions being mined: ', Object.keys(block.transactions).length)
            this.log('Number of actions being mined: ', Object.keys(block.actions).length)
            this.log('Current difficulty:', BigInt(parseInt(block.difficulty, 16)))

            let success = false
            
            success = await block.mine(block.difficulty, this.numberOfCores)
            if(success){
                this.successMessage(success)
                this.stop()
                block = success;
                block.endMineTime = Date.now()
                this.previousBlock = block;
                this.socket.emit('success', block)

            }else{
                this.log('Mining failed')
                this.socket.emit('failed')
            }
        }
    }

    async createCoinbase({ transactions, actions }){
        if(this.wallet){
          let miningFees = 0
          let txHashes = Object.keys(transactions);
          let actionHashes = Object.keys(actions);
          for await(let hash of txHashes){
            let transaction = transactions[hash]
            miningFees += transaction.miningFee
          }
          for await(let hash of actionHashes){
            let action = actions[hash]
            miningFees += action.fee
          }
          let coinbase = new Transaction({
            fromAddress:'coinbase',
            toAddress:this.wallet.publicKey,
            amount:this.miningReward //+ miningFees
          })
          coinbase.miningFee = 0
          
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
        
        let coinbase = await this.createCoinbase(rawBlock)
        coinbase.blockNumber = rawBlock.blockNumber
        rawBlock.transactions[coinbase.hash] = coinbase

        let block = new Block({
          blockNumber:rawBlock.blockNumber,
          timestamp:Date.now(),
          transactions:rawBlock.transactions,
          actions:rawBlock.actions,
          previousHash:rawBlock.previousHash
        })
        
        block.startMineTime = Date.now()
        block.coinbaseTransactionHash = coinbase.hash
        //Set difficulty level
        let difficulty = new Difficulty(this.genesis)
        block.difficulty = difficulty.setNewDifficulty(this.previousBlock, block);
        block.challenge = difficulty.setNewChallenge(block)
        block.totalDifficulty = this.calculateTotalDifficulty(block)
        block.minedBy = this.wallet.publicKey;
        return block
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
          console.log(chalk.cyan('* TxHashes : '), Object.keys(block.transactions))
          console.log(chalk.cyan('* ActionHashes : '), Object.keys(block.actions))
          console.log(chalk.cyan('********************************************************************\n'))
        }
        
      }
  

}

module.exports = Miner