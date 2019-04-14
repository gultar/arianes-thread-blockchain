const Transaction = require('./transaction');
// const globalEvents = require('./constants');
const sha256 = require('./sha256');
const merkle = require('merkle');
const crypto = require('crypto');


//////////////////Block/////////////////////
class Block{
  constructor(timestamp, transactions=[], previousHash='', blockNumber=0){ 
    this.blockNumber = blockNumber;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
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
    /***
     * By calculating the merkle root every time the function is called, it 
     * slows down the process, to help adjust block time as well as avoid
     * memory overload.
     */
    
    this.hash = sha256(this.previousHash + this.timestamp + this.createMerkleRoot(this.transactions) + this.nonce).toString();
  }


  isProofValid(difficulty){
    // const difference = currentProof - previousProof;
    this.calculateHash()



    if (this.hash.substring(0, difficulty) === Array(difficulty+1).join("0")) { //hexString.includes('000000', 0)
      if(this.nonce < this.challenge){
        console.log('Nonce too small:', this.nonce);
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
  mine(difficulty){

    return new Promise((resolve) => {
      setImmediate(async () => {
        this.nonce++//Math.random() * 10000000001;

        const dontMine = process.env.END_MINING;
        if (this.isProofValid(difficulty) || dontMine === 'true') {

          if(dontMine === 'true'){
            resolve(false)
          }
          this.endMineTime = Date.now();
          resolve(true);
        } else  {
          resolve(await this.mine(difficulty));
        }

      });
    });

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
