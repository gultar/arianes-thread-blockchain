const Blockchain = require('../classes/blockchain');
const fs = require('fs');
const { logger, readFile } = require('./utils')

var dataBuffer;


const initBlockchain = async () => {
  return new Promise(async (resolve, reject)=>{
    let blockchain = {};
    let blockchainObject = {};
    logger('Initiating blockchain');
    fs.exists('./data/blockchain.json', async (exists)=>{
      
      if(exists){

        let blockchainFile = await readFile('./data/blockchain.json');

        if(blockchainFile){
          try{
            blockchainObject = JSON.parse(blockchainFile);
            blockchain = instanciateBlockchain(blockchainObject);
            resolve(blockchain);
          }catch(e){
            console.log(e);
            resolve(false);
          }
        }else{
          logger('ERROR: Could not read blockchain file')
          resolve(false)
        }
        

      }else{

        logger('Blockchain file does not exist')
        logger('Generating new blockchain')
        let newBlockchain = new Blockchain();
        newBlockchain.saveBlockchain();
        resolve(newBlockchain);
      }
    })
   
  })


};

const instanciateBlockchain = (blockchain) =>{
  return new Blockchain(blockchain.chain, blockchain.difficulty);
}

module.exports = {
  initBlockchain,
  instanciateBlockchain,
}
