
const { MINING_RATE, NEW_DIFFICULTY_LENGTH, BLOCKTIME_MARGIN } = require('./globals');
const { logger } = require('../tools/utils')

/**
  WIP
  Algorithm to increase difficulty over time to ensure uniform block time.
  To be worked on.
  @param {number} $currentChallenge - Mining difficulty current set on blockchain
  @param {number} $lastTimestamp - Time of block creation expressed in milliseconds
  @param {number} $newTimestamp - Time at the end of the block creation process in milliseconds
*/

const setChallenge = (currentChallenge, lastTimestamp, newTimestamp) =>{
  const blockTime = newTimestamp - lastTimestamp;

  if(blockTime > MINING_RATE+BLOCKTIME_MARGIN){
    return currentChallenge-(blockTime - MINING_RATE)
  }else if(blockTime < MINING_RATE-BLOCKTIME_MARGIN){
    return currentChallenge+(MINING_RATE - blockTime)
  }else{
    return currentChallenge;
  }

}


const setDifficulty = (currentDifficulty, challenge, chainLength) =>{
  //Every time challenge value goes beyond a power of ten, increase difficulty
  if(challenge && currentDifficulty && chainLength){
    if(chainLength % NEW_DIFFICULTY_LENGTH == 0){ //
      
      let difficulty = Math.floor(Math.log10(challenge))
      if(difficulty > currentDifficulty + 1){
        return currentDifficulty+1;
      }else if(difficulty == currentDifficulty + 1){
        return currentDifficulty
      }else{
        if(currentDifficulty > 1){
          return currentDifficulty - 1;
        }else{
          return currentDifficulty
        }
      }
    }else{
      return currentDifficulty
    }
    
  }
}

function setNewDifficulty(previousBlock, newBlock){
  const mineTime = (newBlock.timestamp - previousBlock.timestamp) / 1000;
  let adjustment = 1;
  let minimumDifficulty = BigInt(1048576);//'0x100000';
  if(mineTime > 0 && mineTime <= 1){
    adjustment = 15
  }else if(mineTime > 1 && mineTime <= 5){
    adjustment = 10
  }else if(mineTime > 5 && mineTime <= 10){
    adjustment = 5
  }else if(mineTime > 10 && mineTime <= 20){
    adjustment = 0;
  }else if(mineTime > 20 && mineTime <= 30){
    adjustment = 0
  }else if(mineTime > 30 && mineTime <= 40){
    adjustment = -1
  }else if(mineTime > 40 && mineTime <= 50){
    adjustment = -2
  }else if(mineTime > 50 && mineTime <= 60){
    adjustment = -4
  }else if(mineTime > 60 && mineTime <= 70){
    adjustment = -5
  }else if(mineTime > 70){
    adjustment = -10
  }
  // if(mineTime < 15 || mineTime > 30){
  //   adjustment = Math.floor(30 - mineTime);
  // }else{
  //   adjustment = 0;
  // }
  
  
  let difficulty = BigInt(parseInt(previousBlock.difficulty, 16))
  let difficultyBomb = BigInt(Math.floor(Math.pow(2, Math.floor((previousBlock.blockNumber / 1000)-2))))
  // let modifier = Math.max(1 - Math.floor(mineTime / 10), -99)
  // let modifier = BigInt(difficulty / 32n) * BigInt(adjustment)
  // if(modifier < 0){
  //   modifier = (modifier * -1n <= difficulty ? modifier : modifier / 10n)
  // }
  let newDifficulty = BigInt(difficulty) + (BigInt(difficulty/32n) * (BigInt(adjustment))) * BigInt(difficultyBomb)
  newDifficulty = (newDifficulty > minimumDifficulty ? newDifficulty : minimumDifficulty)
  logger(`Difficulty Bomb: ${difficultyBomb}`);

  return BigInt(newDifficulty).toString(16);
}

const setNewChallenge = (block) =>{
  let difficulty = BigInt(parseInt(block.difficulty, 16))
  if(difficulty == 0n) difficulty = 1n
  let newChallenge = BigInt(Math.pow(2, 255) -1) / BigInt(difficulty)
  return newChallenge.toString(16)
}


module.exports = {setChallenge, setDifficulty, setNewChallenge, setNewDifficulty};
