const MINING_RATE= 30 * 1000;
const NEW_DIFFICULTY_LENGTH = 2 * 60 * 24// Every day, if block time is 30 seconds
let endMining = false;
let miner = ''
module.exports = { MINING_RATE, endMining, miner, NEW_DIFFICULTY_LENGTH }
