const Blockchain = require('./blockchain');
const Block = require('./block')
const Transaction = require('./transaction');
const Node = require('../node.js')
const fs = require('fs');
const merkle = require('merkle');
const sha256 = require('./sha256');
var crypto = require('crypto');
const { logger } = require('./utils')

var dataBuffer;

class BlockchainHandler{
  constructor(){
    this.initBlockchain = '';
    this.loadBlockchainFromServer = '';
    this.saveBlockchain = '';
  }
}


const initBlockchain = (token, tryOnceAgain=true, cb) => {
  //flag to avoid crashes if a transaction is sent while loading
  var { port, address } = token;
   logger('Initiating blockchain');
   let blockchain;
   loadBlockchainFromServer((data, err)=>{

     if(err){
       logger(err);
       cb(false, err);
     }
      blockchain = instanciateBlockchain(data);
      cb(blockchain)
    })

};

const loadBlockchainFromServer = (cb) => {
  //flag to avoid crashes if a transaction is sent while loading
  fs.exists('./blockchain.json', function(exists){
    if(exists){
        var data = '';
        let blockchainDataFromFile;
        var rstream = fs.createReadStream('blockchain.json');
        logger('Reading blockchain.json file...');

        rstream.on('error', (err) =>{
                logger(err);
                cb(false, err);
        })

        rstream.on('data', (chunk) => {
                data += chunk;
        });

        rstream.on('close', () =>{  // done

        if(data != undefined){
          try{
            blockchainDataFromFile = JSON.parse(data);
            dataBuffer = instanciateBlockchain(blockchainDataFromFile);
            logger('Blockchain successfully loaded from file and validated')
          }catch(err){
            cb(false, err);
          }

          cb(dataBuffer);

        }else{
          cb(false, 'ERROR: No data found!')
        }

      });

    }else {
            logger('Generating new blockchain')
            let newBlockchain = new Blockchain();
            // newBlockchain = seedNodeList(newBlockchain, thisNode);
            // seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
            blockchain = newBlockchain;
            saveBlockchain(newBlockchain);
            cb(blockchain, "file does not exist. New blockchain generated");
    }

  });


}

const saveBlockchain = (blockchain) => {

  fs.exists('blockchain.json', function(exists){
      if(exists){

          if(blockchain != undefined){

              if(!(blockchain instanceof Blockchain)){
                      blockchain = instanciateBlockchain(blockchain);
              }
              

                  let json = JSON.stringify(blockchain, null, 4);
              if(json != undefined){
                  logger('Writing to blockchain file...');

                  var stream = fs.createWriteStream('blockchain.json');

                  stream.write(json);
                  
                  stream.on('finish', () => {
                    //'All writes are now complete.'
                    logger('Saved blockchain file')
                    
                    
                  });
                  stream.end();
                  stream.on('error', (error) => {
                    logger(error);
                  });

              }

          }

      } else {
        logger("Creating new Blockchain file and saving to it")
        let json = JSON.stringify(blockchain, null, 4);
        if(json != undefined){

          var wstream = fs.createWriteStream('blockchain.json');

          wstream.write(json);
          wstream.end();

        }

      }
  });
}


const instanciateBlockchain = (blockchain) =>{
    return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.publicKeys);
}

module.exports = {
  initBlockchain,
  loadBlockchainFromServer,
  saveBlockchain,
  instanciateBlockchain,
}
