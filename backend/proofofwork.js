let { miner } = require('./constants')
const mine = async (block, difficulty, endMining)=> new Promise((resolve) => {
      miner = setImmediate(async () => {

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

  });
});


module.exports = mine;
