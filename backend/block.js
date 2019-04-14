const Transaction = require('./transaction');
// const globalEvents = require('./constants');
const sha256 = require('./sha256');
const merkle = require('merkle');
const crypto = require('crypto');
const mineBlock = require('./proof')
const {logger} = require('./utils');
const chalk = require('chalk')

process.env.MINER = ()=>{}

//////////////////Block/////////////////////
class Block{
  constructor(timestamp, transactions=[], previousHash='', blockNumber=0){ 
    this.blockNumber = blockNumber;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
    this.merkleRoot = this.createMerkleRoot(this.transactions);
    this.nonce = 0;
    this.valid = true;
    this.minedBy = '';
    this.challenge = 0;
    this.startMineTime = Date.now();
    this.endMineTime = 0
  }
  /**
    Will be called on every iteration of the mining method
  */
  calculateHash(){
    this.hash = sha256(this.previousHash + this.timestamp + this.merkleRoot + this.nonce).toString();
  }


  isProofValid(difficulty){
    
    this.calculateHash()

    if (this.hash.substring(0, difficulty) === Array(difficulty+1).join("0")) { //hexString.includes('000000', 0)
      if(this.nonce < this.challenge){
        logger(chalk.red('BLOCK INVALID: Nonce too small:'+ this.nonce));
        return false;
      }
      return true;
    }

    return false;
  }


  /**
    Will mine block hash until a valid hash is found or until another
    node finds the answer.
    @param $difficulty - Block mining difficulty set by network
  */
  async mine(difficulty, callback){
    
    process.MINER = await mineBlock(this, difficulty);
    
    process.MINER
    .on('started', () => {})
    .on('stopped', async () => {
      if(this.hash.substring(0, difficulty) === Array(difficulty+1).join("0")){//(this.isProofValid(difficulty)){

        this.endMineTime = Date.now()
        callback(true);

      }else{
        
        callback(false);
      }
    })
    .on('error', (err) => {
      console.log(err)
    })
    .start()


  }


  createMerkleRoot(transactions){

  	if(transactions != undefined){
  		var transactionHashes = Object.keys(transactions);
  		let merkleRoot = merkle('sha256').sync(transactionHashes);
      return merkleRoot.root();
  	}

  }



}


module.exports = Block
