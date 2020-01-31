const sha256 = require('../../tools/sha256');
const merkle = require('merkle');

//Miner has to be instantiated 
process.env.MINER = ()=>{}

//////////////////Block/////////////////////
class Block{
  constructor({timestamp, transactions={}, actions={}, previousHash='', blockNumber=0}){ 
    this.blockNumber = blockNumber;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.actions = actions;
    this.previousHash = previousHash;
    this.totalDifficulty = '0x1'
    this.difficulty = 1;
    this.merkleRoot = this.createMerkleRoot(this.transactions);
    this.actionMerkleRoot = this.createMerkleRoot(this.actions);
    this.nonce = 0;
    this.hash = this.calculateHash();
    // this.valid = true;
    this.minedBy = '';
    this.challenge = 1;
    this.startMineTime = Date.now();
    this.endMineTime = 0;
    this.coinbaseTransactionHash = '';
    this.signatures = {}  //{ publicKey : signature }
  }
  /**
    Will be called on every iteration of the mining method
  */
  calculateHash(){
    this.hash = sha256(this.previousHash + this.timestamp + this.merkleRoot + this.nonce + this.actionMerkleRoot).toString();
  }

  
  // mine(difficulty){
  //     return new Promise((resolve)=>{
  //       if(!process.ACTIVE_MINER){
          
  //         process.ACTIVE_MINER = require('child_process').fork(`./backend/tools/proofOfWork.js`);
  //         process.ACTIVE_MINER.send({block:this, difficulty:difficulty})
  //         process.ACTIVE_MINER.on('message', (message)=>{
            
  //           if(message.message) console.log(message.message)
  //           if(message.success){
  //             let block = message.success
  //             resolve(block)
  //           }else if(message.aborted){
  //             process.ACTIVE_MINER.kill()
  //             resolve(false)
              
  //           }
  
            
  //         })
  //         process.ACTIVE_MINER.on('error', function(data) {
  //             console.log('stderr: ' + data);
  //             resolve(false)
  //         });
  //         process.ACTIVE_MINER.on('close', function() { })
  //       }else{
  //         //logger('ERROR: Already started miner')
  //       }
  //     })
      

  // }

  mine(difficulty, numberOfCores){
    return new Promise(async(resolve)=>{
      const {
        Worker, isMainThread, parentPort, workerData, MessageChannel
      } = require('worker_threads');

      const stopMiners = async ({ stop, abort })=>{
        if(process.WORKER_POOL){
          for await(let worker of process.WORKER_POOL){
            if(stop){
              worker.postMessage({stop:true})
            }else if(abort){
              worker.postMessage({abort:true})
            }
          }
        }
      }

      process.WORKER_POOL = []
      
      if (isMainThread){
        let cpus = require('os').cpus()
        
        if(numberOfCores && typeof numberOfCores == 'number'){
          cpus = new Array(numberOfCores)
        }
        
        for await(let cpu of cpus){
          const worker = new Worker(__dirname+'/../proofOfWork/pow.js', {
            workerData: {
              block:this,
              difficulty:difficulty
            }
          });
          
          worker.on('message', async(message)=>{
            if(message.message) console.log(message.message)
            if(message.success){
              let block = message.success
              process.STOP_WORKERS({stop:true})
              resolve(block)
            }else if(message.aborted){
              console.log('Aborting miners')
              process.STOP_WORKERS({ abort:true })
              resolve(false)
            }
          });
          
          worker.on('error', async(error)=>{
            console.log('ERROR:', error)
            process.STOP_WORKERS({ abort:true })
          });

          worker.on('exit', (code) => {});

          worker.postMessage({start:true})
          process.WORKER_POOL.push(worker)
        }

        process.STOP_WORKERS = stopMiners
      }else{
        console.log('Inside Worker!');
        console.log(isMainThread);
      }

    })
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
