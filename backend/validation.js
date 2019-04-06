
const Blockchain = require('./blockchain');
const Block = require('./block');
const Transaction = require('./Transaction');


const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;


  if(receivedBlockchain != undefined && storedBlockchain != undefined){

		if(!(receivedBlockchain instanceof Blockchain)){
			receivedBlockchain = instanciateBlockchain(receivedBlockchain);
		}

		if(!(storedBlockchain instanceof Blockchain)){
			storedBlockchain = instanciateBlockchain(storedBlockchain);
		}
		 //Does it exist and is it an instance of Blockchain or an object?
    if(receivedBlockchain.isChainValid()){ //Is the chain valid?
			//Try sending a notice or command to node with invalid blockchain
			console.log('Blockchain has been validated');
      if(storedBlockchain.chain.length > receivedBlockchain.chain.length){ //Which chain is the longest?
					console.log('Local chain is the longest. Choosing this one');
          longestBlockchain = storedBlockchain;
      }
      else if(storedBlockchain.chain.length == receivedBlockchain.chain.length){ //Same nb of blocks

          let lastStoredBlock = storedBlockchain.getLatestBlock();
          let lastReceivedBlock = receivedBlockchain.getLatestBlock();

					if(lastReceivedBlock.timestamp < lastStoredBlock.timestamp){
						console.log('The last block on received chain is older');
						longestBlockchain = receivedBlockchain;
					}else if(lastStoredBlock.timestamp < lastReceivedBlock.timestamp){
						console.log('The last block on local chain is older');
						longestBlockchain = storedBlockchain;
					}else{
						console.log('The two chains and last two blocks are the same.')
						longestBlockchain = storedBlockchain;
					}

        	//validated block
      }
      else{
				console.log('Received chain is the longest. Choosing this one');
        longestBlockchain = receivedBlockchain;
      }

      return longestBlockchain;
    }
    else if(storedBlockchain.isChainValid()){
      console.log('Blockchain has been validated!');
			console.log('Received blockchain not valid. Reverting to local chain');
      return storedBlockchain;
    }else{
			return new Blockchain();
		}


  }else if(storedBlockchain == undefined && receivedBlockchain != undefined){


		receivedBlockchain = instanciateBlockchain(receivedBlockchain);
		if(receivedBlockchain.isChainValid()){
      console.log('Received chain validated!');
			console.log('Local chain is undefined. Using received chain');
      return receivedBlockchain;
    }else{
			console.log('Received chain is not valid. Returning new Blockchain')
			return new Blockchain()
		}

	}else if(storedBlockchain != undefined && receivedBlockchain == undefined){

		storedBlockchain = instanciateBlockchain(storedBlockchain);
		if(storedBlockchain.isChainValid()){
      console.log('Received chain validated!');
			console.log('Received chain is undefined. Using local chain');
      return storedBlockchain;
    }else{
			console.log('Local chain is not valid. Returning new Blockchain')
			return new Blockchain()
		}

  }else{
		console.log('Both copies of the blockchain were undefined. Returning new blockchain copy instead')
		return new Blockchain();
	}

}

const instanciateBlockchain = (blockchain) =>{
	return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks);
}

module.exports = { compareBlockchains };
