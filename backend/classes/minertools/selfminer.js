

const Block = require('../block');
const { logger, displayTime } = require('../../tools/utils');
const { isValidBlockJSON } = require('../../tools/jsonvalidator');
const chalk = require('chalk');
const { setChallenge, setDifficulty, setNewDifficulty, setNewChallenge } = require('../challenge')
const ioClient = require('socket.io-client');
class SelfMiner{
    constructor(params){
        this.address = params.address;
        this.publicKey = params.publicKey;
        this.verbose = params.verbose;
        this.previousBlock = {}
        this.pool = {
          pendingTransactions:{},
          pendingActions:{}
        }
        this.minerReady = false;
        this.minerStarted = false;
        this.pool = {
          pendingTransactions:{},
          pendingActions:{}
        }
    }

    connect(url){
      if(url){
        this.socket = ioClient(url)
        this.socket.on('connect', ()=>{
          console.log('Miner connected!')
          this.socket.emit('getLatestBlock')
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
        this.socket.on('latestBlock', (block)=>{
          clearInterval(this.minerLoop)
          this.previousBlock = block; 
          this.start()
        })
        this.socket.on('stopMining', ()=>{ this.pause() })
        this.socket.on('startMining', ()=>{ this.start() })
        this.socket.on('error', error => console.log('ERROR',error))
        this.socket.on('disconnect', ()=>{
          logger('Connection to node dropped')
        })
      }
    }

    async start(){
      
        this.minerLoop = setInterval(async ()=>{
          if(!this.minerStarted){
            let updated = await this.updateTransactions()
            if(updated){
              let block = await this.buildNewBlock();
              if(block){
                this.minerStarted = true
                logger('Starting to mine next block')
                logger('Number of transactions being mined: ', Object.keys(this.pool.pendingTransactions).length)
                logger('At difficulty: ', parseInt(block.difficulty, 16))
                let success = await block.mine(block.difficulty);
                if(success){
                  
                  block = success;
                  block.totalDifficulty = this.previousBlock.totalDifficulty + block.difficulty;
                  this.successMessage(block)
                  this.socket.emit('newBlock', block)
                  this.pause()
                  this.pool.pendingTransactions = {}
                  this.updateTransactions()
                  .then( updated =>{
                    // this.socket.emit('getLatestBlock')
                    
                  })
                }else{
                  logger('Mining unsuccessful')
                  this.minerStarted = false;
                  
                }
              }else{
                this.minerStarted = false
              }
            }else{
              logger('Transaction pool not yet updated')
            }

          }
        }, 1000)
  
      
      
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

    getTxList(){
      return new Promise((resolve)=>{
        this.socket.emit('getTxHashList')
        this.socket.on('txHashList', (list)=>{
            if(list){
                this.socket.off('txHashList')
                resolve(list)
            }
        })
      })
    }

    pause(){
      logger('Stopping miner')
      process.ACTIVE_MINER.kill()
      process.ACTIVE_MINER = false;
      this.minerStarted = false;
      clearInterval(this.minerLoop)
    }

    async buildNewBlock(){
      let transactions = this.pool.pendingTransactions
      if(Object.keys(transactions).length > 0){
        let block = new Block(Date.now(), transactions);
        block.blockNumber = this.previousBlock.blockNumber + 1;
        block.previousHash = this.previousBlock.hash;
        block.difficulty = setNewDifficulty(this.previousBlock, block);
        block.challenge = setNewChallenge(block)
        block.minedBy = this.publicKey;
        return block;
      }else{
        logger('Not enough tx')
      }
      
    }


    successMessage(block){
      console.log(chalk.cyan('\n********************************************************************'))
      console.log(chalk.cyan('* Block number : ')+block.blockNumber);
      console.log(chalk.cyan('* Block Hash : ')+ block.hash.substr(0, 25)+"...")
      console.log(chalk.cyan('* Previous Hash : ')+ block.previousHash.substr(0, 25)+"...")
      console.log(chalk.cyan("* Block successfully mined by : ")+block.minedBy+chalk.cyan(" at ")+displayTime()+"!");
      console.log(chalk.cyan("* Challenge : "), block.challenge);
      console.log(chalk.cyan("* Block time : "), (block.endMineTime - block.startMineTime)/1000)
      console.log(chalk.cyan("* Nonce : "), block.nonce)
      console.log(chalk.cyan("* Difficulty : "), parseInt(block.difficulty, 16))
      console.log(chalk.cyan("* Total Challenge : "), block.totalChallenge)
      console.log(chalk.cyan('* Number of transactions in block : '), Object.keys(block.transactions).length)
      console.log(chalk.cyan('********************************************************************\n'))
    }

    

}

module.exports = SelfMiner;