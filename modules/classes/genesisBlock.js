const Block = require('./blockchain/block')
const Transaction = require('./transactions/transaction')
const { setNewChallenge, setNewDifficulty, Difficulty } = require('./proofOfWork/challenge')
const { logger, writeToFile, readFile } = require('../tools/utils')
const sha256 = require('../tools/sha256')

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
 function saveGenesisFile(genesisBlock=createGenesisBlock()){
    return new Promise(async (resolve)=>{
      // let genesisBlock = this.createGenesisBlock();
      let saved = await writeToFile(genesisBlock, './config/genesis.json')
      if(saved){
        resolve(genesisBlock)
      }else{
        resolve({error:'Could not save genesis file'})
      }
    })
  }

function createGenesisBlock(){
    let genesisBlock = new Block({
        timestamp:1554987342039,
        transactions:{ 
              'maxCurrency':new Transaction
              ({
                fromAddress:'coinbase',
                toAddress:'coinbase',
                amount:1000 * 1000 * 1000 * 1000,
                data:'Maximum allowed currency in circulation',
                type:'coinbaseReserve',
                hash:false,
                miningFee:0
              }),
            },
        actions:{}
      })
      genesisBlock.difficulty = '0x1024'//'0x100000';//'0x2A353F';
      genesisBlock.totalDifficulty = genesisBlock.difficulty
      genesisBlock.challenge = setNewChallenge(genesisBlock)
      genesisBlock.blockTime = 10
      genesisBlock.consensus = "Proof of Work" //Possible values : Proof of Work, Permissioned, Proof of Stake, Proof of Importance
      genesisBlock.network = "mainnet"
      genesisBlock.maxCoinSupply = Math.pow(10, 10);
      genesisBlock.signatures = {}
      genesisBlock.hash = sha256( genesisBlock.maxCoinSupply + genesisBlock.difficulty + genesisBlock.challenge + genesisBlock.merkleRoot + genesisBlock.signatures )
      genesisBlock.calculateHash();
      genesisBlock.states = {
        //Other public addresses can be added to initiate their balance in the genesisBlock
        //Make sure at least one of the them has some funds, otherwise no transactions will be possible
        "coinbase":{ balance:1000 * 1000 * 1000 * 1000 },
        "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG":{ balance:10000 },
        "AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6":{ balance:10000 },
        "A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R":{ balance:10000 },
        "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr":{ balance:10000 },
      }

      return genesisBlock
  }


module.exports = { createGenesisBlock, saveGenesisFile, loadGenesisFile  }