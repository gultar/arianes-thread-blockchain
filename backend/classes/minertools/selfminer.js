

const Block = require('../block');
const { logger, displayTime } = require('../../tools/utils');
const { isValidBlockJSON } = require('../../tools/jsonvalidator');
const chalk = require('chalk');
const { setChallenge, setDifficulty } = require('../challenge')
const ioClient = require('socket.io-client');
class SelfMiner{
    constructor(params){
        this.address = params.address;
        this.publicKey = params.publicKey;
        this.verbose = params.verbose;
        this.chainState = {}
        this.previousBlock = {}
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
        this.socket.on('connect', async ()=>{
          this.socket.emit('getLatestBlock');
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
        this.socket.on('mineNextBlock', (block)=>{
          if(block.error){
            logger(block.error)
          }else{
            this.previousBlock = block;
            this.chainState[block.blockNumber] = block.hash
            this.start()
          }
        })
        this.socket.on('stopMining', ()=>{ 
            this.stop();
            this.pool = {
              pendingTransactions:{},
              pendingActions:{}
            } 
          })
        this.socket.on('error', error => console.log(error))
        this.socket.on('disconnect', ()=> logger('Connection to node dropped'))
      }
    }

    async start(){
      
        this.workLoop = setInterval(async ()=>{
          if(!this.minerStarted){
            let updated = await this.updateTransactions()
            if(updated){
              let block = await this.buildNewBlock();
              if(block){
                this.minerStarted = true
                logger('Starting to mine next block')
                logger('Number of transactions being mined: ', Object.keys(this.pool.pendingTransactions).length)
                let success = await block.mine(block.difficulty);
                if(success){
                  block = success;
                  block.totalChallenge = this.previousBlock.totalChallenge + block.nonce;
                  this.chainState[block.blockNumber] = block.hash
                  this.stop()
                  this.successMessage(block)
                  this.socket.emit('newBlock', block)
                  this.pool = {
                    pendingTransactions:{},
                    pendingActions:{}
                  }
                  this.minerStarted = false;
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
          let txCounter = 0;
          for(var i=0; i < list.length; i++){
            this.socket.emit('getTx', list[i])
          }
          this.socket.on('tx', (tx)=>{
            
            if(tx){
                this.pool.pendingTransactions[tx.hash] = tx;
                txCounter++;
            }
            if(txCounter == list.length){
              this.socket.off('tx')
              resolve(true)
            }
            
          })
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

    stop(){
      logger('Stopping miner')
      if(process.ACTIVE_MINER){
        clearInterval(this.workLoop);
        process.ACTIVE_MINER.kill()
        process.ACTIVE_MINER = false;
        this.minerStarted = false;
        this.previousBlock = {}
      }
      
    }

    async buildNewBlock(){
      return new Promise(async (resolve)=>{
        let transactions = this.pool.pendingTransactions
        if(Object.keys(transactions).length > 0){
          if(this.previousBlock && !this.chainState[this.previousBlock.blockNumber + 1]){
            let block = new Block(Date.now(), transactions);
            block.blockNumber = this.previousBlock.blockNumber + 1;
            block.previousHash = this.previousBlock.hash;
            block.challenge = setChallenge(this.previousBlock.challenge, this.previousBlock.startMineTime, this.previousBlock.endMineTime)
            block.difficulty = setDifficulty(this.previousBlock.difficulty, this.previousBlock.challenge, block.blockNumber);
            block.minedBy = this.publicKey;
            resolve(block)
          }else{
            this.socket.emit('getLatestBlock')
            resolve(false)
          }
        }else{
          logger('Not enough tx')
          resolve(false)
        }
      })
      
      
    }

    successMessage(block){
      console.log(chalk.cyan('\n********************************************************************'))
      console.log(chalk.cyan('* Block number : ')+block.blockNumber);
      console.log(chalk.cyan('* Block Hash : ')+ block.hash.substr(0, 25)+"...")
      console.log(chalk.cyan('* Previous Hash : ')+ block.previousHash.substr(0, 25)+"...")
      console.log(chalk.cyan("* Block successfully mined by : ")+block.minedBy)
      console.log(chalk.cyan("* Challenge : "), block.challenge);
      console.log(chalk.cyan("* Block time : "), (block.endMineTime - block.startMineTime)/1000)
      console.log(chalk.cyan("* Nonce : "), block.nonce)
      console.log(chalk.cyan("* Total Challenge : "), block.totalChallenge)
      console.log(chalk.cyan('* Number of transactions in block : '), Object.keys(block.transactions).length)
      console.log(chalk.cyan('********************************************************************\n'))
    }

}

module.exports = SelfMiner;