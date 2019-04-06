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

const isProofValid = (previousProof, currentProof) => {
  const difference = currentProof - previousProof;
  const proofString = `difference-${difference}`;
  const hashFunction = crypto.createHash('sha256');
  hashFunction.update(proofString);
  const hexString = hashFunction.digest('hex');
  if (hexString.substring(0, 5) === Array(6).join("0")) { //hexString.includes('000000', 0)
    return hexString;
  }
  return false;
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

tryOut()

module.exports = { generateProof, isProofValid }
