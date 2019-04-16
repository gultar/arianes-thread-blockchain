const Blockchain = require('./blockchain');
const Block = require('./block')
const Transaction = require('./transaction');
const Node = require('../node.js')
const fs = require('fs');
const merkle = require('merkle');
const sha256 = require('./sha256');
var crypto = require('crypto');
const { logger, readFile } = require('./utils')

var dataBuffer;


const initBlockchain = async () => {
  return new Promise(async (resolve, reject)=>{
    let blockchain = {};
    let blockchainObject = {};
    logger('Initiating blockchain');
    fs.exists('blockchain.json', async (exists)=>{
      
      if(exists){

        let blockchainFile = await readFile('blockchain.json');

        if(blockchainFile){
          try{
            blockchainObject = JSON.parse(blockchainFile);
            blockchain = instanciateBlockchain(blockchainObject);
            resolve(blockchain);
          }catch(e){
            logger(e);
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
  return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.publicKeys);
}

// const loadBlockchainFromServer = (cb) => {
//   //flag to avoid crashes if a transaction is sent while loading
//   fs.exists('./blockchain.json', function(exists){
//     if(exists){
//         var data = '';
//         let blockchainDataFromFile;
//         var rstream = fs.createReadStream('blockchain.json');
//         logger('Reading blockchain.json file...');

//         rstream.on('error', (err) =>{
//                 logger(err);
//                 cb(false, err);
//         })

//         rstream.on('data', (chunk) => {
//                 data += chunk;
//         });

//         rstream.on('close', () =>{  // done

//         if(data != undefined){
//           try{
//             blockchainDataFromFile = JSON.parse(data);
//             dataBuffer = instanciateBlockchain(blockchainDataFromFile);
//             logger('Blockchain successfully loaded from file and validated')
//           }catch(err){
//             cb(false, err);
//           }

//           cb(dataBuffer);

//         }else{
//           cb(false, 'ERROR: No data found!')
//         }

//       });

//     }else {
            
//             // newBlockchain = seedNodeList(newBlockchain, thisNode);
//             // seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
//             blockchain = newBlockchain;
//             saveBlockchain(newBlockchain);
//             cb(blockchain, "file does not exist. New blockchain generated");
//     }

//   });


// }

// const saveBlockchain = (blockchain, callback) => {

//   fs.exists('blockchain.json', function(exists){
//       if(exists){

//           if(blockchain != undefined){

//               if(!(blockchain instanceof Blockchain)){
//                       blockchain = instanciateBlockchain(blockchain);
//               }
              

//                   let json = JSON.stringify(blockchain, null, 4);
//               if(json != undefined){

                    
//                     logger('Writing to blockchain file...');
      
//                     var stream = fs.createWriteStream('blockchain.json');
  
//                     stream.write(json);
//                     stream.end();
//                     stream.on('finish', () => {
//                       //'All writes are now complete.'
//                       logger('Saved blockchain file')
//                       if(callback) callback(true);
//                     });
                    
//                     stream.on('error', (error) => {
//                       logger(error);
//                     });

//               }

//           }

//       } else {
//         logger("Creating new Blockchain file and saving to it")
//         let json = JSON.stringify(blockchain, null, 4);
//         if(json != undefined){

//           var wstream = fs.createWriteStream('blockchain.json');

//           wstream.write(json);
//           wstream.end();

//         }

//       }
//   });
// }

// function copyFile(source, target) {
//   var rd = fs.createReadStream(source);
//   var wr = fs.createWriteStream(target);
//   return new Promise(function(resolve, reject) {
//     rd.on('error', reject);
//     wr.on('error', reject);
//     wr.on('finish', resolve);
//     rd.pipe(wr);
//   }).catch(function(error) {
//     rd.destroy();
//     wr.end();
//     throw error;
//   });
// }




module.exports = {
  initBlockchain,
  loadBlockchainFromServer,
  saveBlockchain,
  instanciateBlockchain,
}
