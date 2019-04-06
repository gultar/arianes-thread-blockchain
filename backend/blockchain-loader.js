const fs = require('fs');
const { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord } = require('./blockchain');
const { compareBlockchains } = require('./validation.js');


let blockchainFetched;
let blockchain;


const loadBlockchainFromServer = () => {

  //flag to avoid crashes if a transaction is sent while loading
	fs.exists('../blockchain.json', function(exists){
		if(exists){
			var data = '';
			let blockchainDataFromFile;
			var rstream = fs.createReadStream('../blockchain.json');
			console.log('Reading blockchain.json file...');

			rstream.on('error', (err) =>{
				console.log(err);
				return err;
			})

			rstream.on('data', (chunk) => {
				data += chunk;
			});



			rstream.on('close', () =>{  // done

				if(data != undefined){
						blockchainDataFromFile = JSON.parse(data);
						blockchainFetched = instanciateBlockchain(blockchainDataFromFile);

						//validateBlockchain(blockchainFetched); --- To be created
						console.log('Blockchain successfully loaded from file and validated')
						// blockchain = compareBlockchains(blockchain, blockchainFetched);

						return blockchainFetched;

				}else{
					return false;
				}


			});

		}else {
			console.log('Generating new blockchain')
				let newBlockchain = new Blockchain();
				// newBlockchain = seedNodeList(newBlockchain, thisNode);
				// seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
				blockchain = newBlockchain;
				saveBlockchain(newBlockchain);
				console.log("file does not exist")

				return false;
		}

	});


}

const saveBlockchain = (blockchainReceived) => {


  fs.exists('../blockchain.json', function(exists){
      if(exists){
				var longestBlockchain;

				if(blockchainReceived != undefined){

					if(!(blockchainReceived instanceof Blockchain)){
						blockchainReceived = new Blockchain(
							blockchainReceived.chain,
							blockchainReceived.pendingTransactions,
							blockchainReceived.nodeAddresses,
							blockchainReceived.ipAddress,
							blockchainReceived.orphanedBlocks
						)
					}

					if(blockchain != undefined){
						longestBlockchain = compareBlockchains(blockchain, blockchainReceived);
					}else{
						longestBlockchain = blockchainReceived;
					}

					let json = JSON.stringify(longestBlockchain);

					if(json != undefined){
						console.log('Writing to blockchain file...');

						var wstream = fs.createWriteStream('../blockchain.json');

						wstream.write(json);

						console.log('BLOCKCHAIN', blockchain);
					}

					// });
				}

      	} else {
          console.log("Creating new Blockchain file and saving to it")
          let json = JSON.stringify(blockchainReceived);
          if(json != undefined){

						var wstream = fs.createWriteStream('../blockchain.json');

						wstream.write(json);
          }

			}
      });
}

const instanciateBlockchain = (blockchain) =>{
	return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks);
}

module.exports = { loadBlockchainFromServer, saveBlockchain, instanciateBlockchain }
