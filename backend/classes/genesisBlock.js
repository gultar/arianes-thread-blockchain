const Block = require('./block')
const Transaction = require('./transaction')
const { setNewChallenge, setNewDifficulty, Difficulty } = require('./challenge')
const { logger, writeToFile, readFile } = require('../tools/utils')

 /**
   * Fetches existing genesisBlock
   */
function loadGenesisFile(){
    return new Promise(async (resolve)=>{
      fs.exists('./config/genesis.json', async (exists)=>{
        if(exists){
          let genesis = await readFile('./config/genesis.json');
          if(genesis){
            genesis = JSON.parse(genesis)
            resolve(genesis)
          }else{
            resolve({error:'Could not load genesis file'})
          }
        }else{
          let genesis = await this.saveGenesisFile();
          if(!genesis.error){
            resolve(genesis)
          }else{
            resolve({error:'Could not load genesis file'})
          }
        }
        
      })
      
    })
  }


  /**
   * Creates a new genesisBlock json file in /config
   * Needed to create a new blockchain
   */
 function saveGenesisFile(){
    return new Promise(async (resolve)=>{
      let genesisBlock = this.createGenesisBlock();
      let saved = await writeToFile(genesisBlock, './config/genesis.json')
      if(saved){
        resolve(genesisBlock)
      }else{
        resolve({error:'Could not save genesis file'})
      }
    })
  }

function createGenesisBlock(){
    let genesisBlock = new Block(1554987342039,
      { 
        'maxCurrency':new Transaction
        (
          'coinbase',
          "coinbase", 
          1000 * 1000 * 1000 * 1000, 
          'Maximum allowed currency in circulation',
          'coinbaseReserve',
          false,
          0
        ),
      }, {});
      genesisBlock.difficulty = '0x100000';//'0x2A353F';
      genesisBlock.totalDifficulty = genesisBlock.difficulty
      genesisBlock.difficultyBoundDivider = 512
      genesisBlock.challenge = setNewChallenge(genesisBlock)
      genesisBlock.maxCoinSupply = Math.pow(10, 10);
      genesisBlock.calculateHash();
      genesisBlock.states = {
        //Other public addresses can be added to initiate their balance in the genesisBlock
        //Make sure at least one of the them has some funds, otherwise no transactions will be possible
        "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG":{  balance:10000, lastTransaction:'coinbase', },
        "AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6":{  balance:10000, lastTransaction:'coinbase', },
        "A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R":{  balance:10000, lastTransaction:'coinbase', },
        "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr":{  balance:10000, lastTransaction:'coinbase', },
      }

      return genesisBlock
  }


module.exports = { createGenesisBlock, saveGenesisFile, loadGenesisFile  }