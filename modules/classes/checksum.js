const sha256 = require('../tools/sha256')

const createChecksum = async (timestamp, randomOrder)=>{
    let nodeChecksum = '';
    let blockchainChecksum = '';
    let blockChecksum = '';
    let challengeChecksum = '';
    let transactionChecksum = '';

    let nodeFile = await readFile('../../node.js');
    let blockchainFile = await readFile(`./chain.js`);
    let blockFile = await readFile(`./block.js`);
    let challengeFile = await readFile(`./challenge.js`);
    let transactionFile = await readFile(`./transaction.js`);

    if(nodeFile && blockchainFile && blockFile && challengeFile && transactionFile){
      nodeChecksum = await sha256(nodeFile)
      blockchainChecksum = await sha256(blockchainFile)
      blockChecksum = await sha256(blockFile)
      challengeChecksum = await sha256(challengeFile)
      transactionChecksum = await sha256(transactionFile);

      let checksumArray = [
        nodeChecksum,
        blockchainChecksum,
        blockChecksum,
        challengeChecksum,
        transactionChecksum
      ]
  
      checksumArray.sort((a, b)=>{
        return 0.5 - randomOrder;
      })
  
      let finalChecksum
      checksumArray.forEach( checksum=>{
        finalChecksum = finalChecksum + checksum;
      })
  
      finalChecksum = sha256(finalChecksum + timestamp.toString()) ;
      return finalChecksum;

    }else{
      return false;
    }
    
  }

  module.exports = createChecksum