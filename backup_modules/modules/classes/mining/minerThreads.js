let LoopyLoop = require('loopyloop')
const sha256 = require('../../tools/sha256');
const { workerData, parentPort } = require('worker_threads')
let minerLoop = false
const mineNextBlock = async (blockToMine) =>{
  let block = blockToMine;
  
    let miner =  new LoopyLoop(async () => {
      
      if(isValidProof(block)){
        block.endMineTime = Date.now(); 
        parentPort.postMessage({success:block})
        miner.stop()
      }else{
        block.nonce = block.nonce + (Math.pow(2, 10) * Math.random())
        if(block.nonce == 'Infinity'){
          logger('Resetting nonce')
          block.nonce = 0;
        }
        // console.log('Target:', BigInt(parseInt(block.challenge, 16)))
        // console.log('Value:', BigInt(parseInt(block.hash, 16)))
      }
    })

    return miner;
}

const isValidProof = (block) =>{
        
    block.hash = calculateHash(block)
    if(BigInt(parseInt(block.hash, 16)) <= BigInt(parseInt(block.challenge, 16))){
      return true
    }else{
      return false
    }
  }

  const calculateHash = (block) =>{
    return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce + block.actionMerkleRoot).toString();
  }

  

  const startMinerThreads = () =>{
   
    if(!minerLoop){
        parentPort.on('message', async(message)=>{
            if(message.abort){
                minerLoop.stop();
                minerLoop = false;
                parentPort.postMessage({aborted:true})
                process.exit(0)
            }else if(message.stop){
                minerLoop.stop();
                minerLoop = false;
                process.exit(0)
            }else if(message.start){
                let block = workerData.block;
                block.difficulty = workerData.difficulty;
                minerLoop = await mineNextBlock(block);
                minerLoop
                .on('started', () => {})
                .on('stopped', async () => {})
                .on('error', (err) => {
                  console.log(err)
                })
                .start()
            }

        })

      }else{
        console.log(`Already started mining on ${process.pid}`)
      }
  }
  
  startMinerThreads()