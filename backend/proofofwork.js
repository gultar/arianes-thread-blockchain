
let LoopyLoop = require('loopyloop')

const mineBlock = async (blockToMine, difficulty) =>{
  let block = blockToMine;
    
    let miner =  new LoopyLoop(async () => {
      
      if(isProofValid(block, difficulty)){ 
        miner.stop()
      }else{

        block.nonce++;
        
      }
    })

    return miner;
}

const isProofValid = (block, difficulty) =>{
  block.calculateHash()
  if (block.hash.substring(0, difficulty) === Array(difficulty+1).join("0")) { //hexString.includes('000000', 0)
    if(block.nonce < block.challenge){
      return false
    }
    return true;
  }

  return false;
}




module.exports = mineBlock;
