
let LoopyLoop = require('loopyloop')
const sha256 = require('./sha256');

const mineBlock = async (blockToMine, difficulty) =>{
  let block = blockToMine;
    
    let miner =  new LoopyLoop(async () => {
      
      if(isProofValid(block, difficulty)){
        block.endMineTime = Date.now(); 
        process.send({success:block})
        miner.stop()
      }else{

        block.nonce++;
        
      }
    })

    return miner;
}

const calculateHash = (block) =>{
  return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce + block.actionMerkleRoot).toString();
}

const isProofValid = (block, difficulty) =>{
  block.hash = calculateHash(block)

  if (block.hash.substring(0, difficulty) === Array(difficulty+1).join("0")) { //hexString.includes('000000', 0)
    if(block.nonce < block.challenge){
      return false
    }else{
      return block;
    }
    
  }

  return false;
}

const remotePoWProcess = () =>{
  process.on('message', async(message)=>{

    try{
      if(!process.MINER){
          let block = message.block;
          let difficulty = block.difficulty;
          process.MINER = await mineBlock(block, difficulty);

          process.MINER
          .on('started', () => {})
          .on('stopped', async () => {})
          .on('error', (err) => {
            console.log(err)
          })
          .start()
        }else{
          if(message.abort){
            process.MINER.stop();
            process.MINER = false;
            process.send({aborted:true})
          }
        }
      
    }catch(e){
      process.send({error:e})
    }
    
  })
}

remotePoWProcess()

