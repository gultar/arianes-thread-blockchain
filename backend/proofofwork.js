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
        

        let dontMine = process.env.END_MINING
      // if(process.env.END_MINING === true) { resolve(false); }

      if(isProofValid(block, difficulty) || dontMine === true){
        if(dontMine == true){
          console.log('cancelled mining');
          resolve(false);
        }

        console.log("Block mined: " + block.hash);
        resolve(true);
      }else{


        block.hash = block.calculateHash();
        resolve(await mine(block, difficulty)) ;

      }

  });
});

const isProofValid = (block, difficulty) =>{
  console.log(block.calculateHash())
  if (block.hash.substring(0, difficulty) === Array(difficulty+1).join("0")) { //hexString.includes('000000', 0)
    
    return true;
  }

  return false;
}

let nonce = 0

let block = {
  nonce: nonce,
  hash : '8efb3a78aba484b6cf78b272ec1413b2865b0cef3f294217eda9b4f1eca3efa0',
  calculateHash:()=>{
    nonce++;
    return sha256('Muppet'+ nonce);
  }
}


const tryOut =  async () =>{
  mine(block, 4)
}


tryOut()



module.exports = mine;
