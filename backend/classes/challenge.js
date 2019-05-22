
const { MINING_RATE, NEW_DIFFICULTY_LENGTH } = require('./globals');

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

  if(blockTime > MINING_RATE+10000){
    return currentChallenge-(blockTime - MINING_RATE)
  }else if(blockTime < MINING_RATE-10000){
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


module.exports = {setChallenge, setDifficulty};
