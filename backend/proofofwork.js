let { miner } = require('./constants');
let sha256 = require('./sha256')

// console.log('proof start')
// if (process.send) {
//   console.log('running with process send')
// }

// process.on('message', message => {
//   if(message =='start'){
//     tryOut()
//   }else if(message == 'stop'){
//     process.env.END_MINING = true;
//   }
  
// });

process.env.END_MINING = false;

const mine = async (block, difficulty)=> new Promise((resolve) => {
      setImmediate(async () => {
        block.nonce++;

        let dontMine = process.END_MINING
      // if(process.env.END_MINING === true) { resolve(false); }

      if(block.hash.substring(0, difficulty) === Array(difficulty+1).join("0") || dontMine === true){
        if(dontMine == true){
          console.log('cancelled mining');
          resolve(false);
        }

        console.log("Block mined: " + block.hash);
        resolve(true);
      }else{


        
        block.hash = block.calculateHash();

        resolve(await mine(block, difficulty, process.env.END_MINING)) ;

      }

  });
});

const isProofValid = (block, difficulty) =>{
  console.log(block.hash)
  if (block.hash.substring(0, difficulty) === Array(difficulty+1).join("0")) { //hexString.includes('000000', 0)
    
    return true;
  }

  return false;
}




let block = {
  hash: sha256('Muppet'),
  nonce: 0,
}
block.calculateHash = ()=>{
    
  return sha256('Muppet'+block.nonce);
}

block.isProofValid = function(difficulty){
  
  if (this.hash.substring(0, difficulty) === Array(difficulty+1).join("0")) { //hexString.includes('000000', 0)
    
    return true;
  }

  return false;
}



block.mineBlock = async (difficulty)=>{
  const dontMine = process.env.END_MINING;
  let that = this;
  setImmediate(async ()=>{
 
      if (block.isProofValid(difficulty) || dontMine === 'true') {
        
        if(dontMine === 'true'){
          console.log('cancelled')
          return false
        }
        console.log('SUCCESS',block.hash)
        process.exit()
        return true;
      } 
      else  {
        block.nonce = block.nonce+1//Math.random() * 10000000001;
        block.hash = block.calculateHash()
        
        return await block.mineBlock(difficulty);
        
      }
  })

}

const tryOut =  async () =>{
  let result = await block.mineBlock(block, 2);
  console.log(result)
  // console.log(await mineBlock(block, 7));

}


tryOut()



module.exports = mine;
