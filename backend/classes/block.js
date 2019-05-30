const Transaction = require('./transaction');
// const globalEvents = require('./constants');
const sha256 = require('../tools/sha256');
const merkle = require('merkle');
const crypto = require('crypto');
const mineBlock = require('../tools/proof')
const {logger} = require('../tools/utils');
const chalk = require('chalk')

//Miner has to be instantiated 
process.env.MINER = ()=>{}

//////////////////Block/////////////////////
class Block{
  constructor(timestamp, transactions={}, actions={}, previousHash='', blockNumber=0){ 
    this.blockNumber = blockNumber;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.actions = actions;
    this.previousHash = previousHash;
    this.difficulty = 1;
    this.hash = this.calculateHash();
    this.merkleRoot = this.createMerkleRoot(this.transactions);
    this.actionMerkleRoot = this.createMerkleRoot(this.actions);
    this.nonce = 0;
    this.valid = true;
    this.minedBy = '';
    this.challenge = 1;
    this.totalChallenge = 1;
    this.startMineTime = Date.now();
    this.endMineTime = 0;
    this.totalSumTransited = 0;
    this.coinbaseTransactionHash = '';
  }
  /**
    Will be called on every iteration of the mining method
  */
  calculateHash(){
    this.hash = sha256(this.previousHash + this.timestamp + this.merkleRoot + this.nonce + this.actionMerkleRoot).toString();
  }

  
  mine(difficulty){
      return new Promise((resolve)=>{
        if(!process.ACTIVE_MINER){
        
          process.ACTIVE_MINER = require('child_process').fork(`./backend/tools/proofOfWork.js`);
          process.ACTIVE_MINER.send({block:this, difficulty:difficulty})
          process.ACTIVE_MINER.on('message', (message)=>{
            
            if(message.message){
              console.log(message.message)
            }
            if(message.success){
              let block = message.success
              resolve(block)
            }else if(message.aborted){
              resolve(false)
              
            }
  
            
          })
          process.ACTIVE_MINER.on('error', function(data) {
              console.log('stderr: ' + data);
              resolve(false)
          });
          process.ACTIVE_MINER.on('close', function() {
              logger('Mining process ended')
          })
        }else{
          logger('ERROR: Already started miner')
        }
      })
      

  }

  // mineBlock(difficulty, callback){
    
  //       if(!process.ACTIVE_MINER){
          
  //         process.ACTIVE_MINER = require('child_process').fork(`./backend/tools/proofOfWork.js`);
  //         process.ACTIVE_MINER.send({block:this, difficulty:difficulty})
  //         process.ACTIVE_MINER.on('message', (message)=>{
            
  //           if(message.message){
  //             console.log(message.message)
  //           }
  //           if(message.success){
  //             let block = message.success
  //             callback(block)
  //           }else if(message.aborted){
  //             callback(false)
              
  //           }
    
            
  //         })
  //         process.ACTIVE_MINER.on('error', function(data) {
  //             console.log('stderr: ' + data);
  //             callback(false)
  //         });
  //         process.ACTIVE_MINER.on('close', function() {
  //             logger('Mining process ended')
  //         })
  //       }else{
  //         logger('ERROR: Already started miner')
  //       }
  //     // })
    
    
  // }


  createMerkleRoot(transactions){

  	if(transactions != undefined){
  		var transactionHashes = Object.keys(transactions);
  		let merkleRoot = merkle('sha256').sync(transactionHashes);
      return merkleRoot.root();
  	}

  }



}


module.exports = Block
