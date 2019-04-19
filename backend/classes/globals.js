// module.exports = {
//   END_MINING: 'endMining',
//   MINING_RATE: 3000,
// };

const MINING_RATE= 2 * 60 * 1000; 
let endMining = false;
let miner = ''
module.exports = { MINING_RATE, endMining, miner }
