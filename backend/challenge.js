
const { MINING_RATE } = require('./constants');

/**
  WIP
  Algorithm to increase difficulty over time to ensure uniform block time.
  To be worked on.
  @param {number} $currentChallenge - Mining difficulty current set on blockchain
  @param {number} $startTime - Time of block creation expressed in milliseconds
  @param {number} $endTime - Time at the end of the block creation process in milliseconds
*/
const setChallenge = (currentChallenge, startTime, endTime) =>{

  // if(!currentChallenge) console.log('Problem with challenge param');
  // if(!startTime) console.log('Problem with start time');
  // if(!endTime) console.log('Problem with end time')
  const modifier = Math.random() * 20000
  return ( endTime - startTime > MINING_RATE ? currentChallenge-modifier : currentChallenge+modifier )

}

/**
 * 
 * 
 */

const adjustDifficulty = () =>{

}

module.exports = setChallenge;
