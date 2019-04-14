const crypto = require('crypto');

class Proof{
  constructor(){
    this.proof = 0;
    this.hash = '';
    this.dontMine = false;
  }

  generateProof(previousProof){
    return new Promise((resolve) => {
      setImmediate(async () => {
        let proof = Math.random() * 10000000001;
        let hash = '';
        const dontMine = process.env.BREAK;
        if (isProofValid(previousProof, proof) || dontMine === 'true') {
          hash = isProofValid(previousProof, proof)
          if(dontMine === 'true'){
            console.log('Mining cancelled')
          }
          resolve({ proof, dontMine, hash });
        } else  {
          resolve(await generateProof(previousProof));
        }
      });
    });
  }

  isProofValid(previousProof, currentProof){
    const difference = currentProof - previousProof;
    const proofString = `difference-${difference}`;
    const hashFunction = crypto.createHash('sha256');
    hashFunction.update(proofString);
    const hexString = hashFunction.digest('hex');
    if (hexString.substring(0, 5) === Array(6).join("0")) { //hexString.includes('000000', 0)
      return hexString;
    }
    return false;
  }
}

const generateProof = (previousProof) => new Promise((resolve) => {
  setImmediate(async () => {
    let proof = Math.random() * 10000000001;
    let hash = '';
    const dontMine = process.env.BREAK;
    if (isProofValid(previousProof, proof) || dontMine === 'true') {
      hash = isProofValid(previousProof, proof)
      if(dontMine === 'true'){
        console.log('Mining cancelled')
      }
      resolve({ proof, dontMine, hash });
    } else  {
      resolve(await generateProof(previousProof));
    }
  });
});

const isProofValid = (difficulty) => {
  var dontMine = process.env.END_MINING;

  if(dontMine === true){
    console.log('Cleared timer successfully')
    clearImmediate(miner);
  }
  // if(process.env.END_MINING === true) { resolve(false); }

  if(block.hash.substring(0, difficulty) === Array(difficulty+1).join("0") || dontMine == true){

    console.log("Block mined: " + this.hash);

    resolve(true);
  }else{


    block.nonce++;
    block.hash = block.calculateHash();

    resolve(await block.mine(block, difficulty, process.env.END_MINING)) ;

  }
};
var startTime = Date.now();
console.log('Start: ', startTime)
// setTimeout(()=>{
//   process.env.BREAK = true;
// }, 2000)
const tryOut = async ()=>{
  var myProof = new Proof();
  var result = await myProof.generateProof(0)
  // var result = await generateProof(0); //6109837942.514816
  console.log(result.proof);
  console.log(result.hash);
  console.log("Difference: ", (Date.now() - startTime)/1000)
}

if (process.send) {
  process.send("Hello");
}

process.on('message', message => {
  console.log('message from parent:', message);
});





module.exports = { generateProof, isProofValid }
