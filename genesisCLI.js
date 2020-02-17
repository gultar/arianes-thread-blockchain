const program = require('commander');
const genesis = require('./modules/tools/getGenesis')
const sha256 = require('./modules/tools/sha256')
const { RecalculateHash, logger } = require('./modules/tools/utils')
const { saveGenesisFile } = require('./modules/classes/genesisBlock')

program
.option('-d, --difficulty <difficultyHex>', '')
.option('-t, --blockTime <blockTime>', 'Ideal block creation time')
.option('-c, --consensus <mode>', 'Consensus algorithm of the network')
.option('-n, --network <network>', 'Name of the network to connect to')
.option('-v, --validators <validatorsString>', 'Initial set of block validators on the network. Usable only on Permissioned or PoS chains')
.option('-s, --minimumSignatures <numOfSignatures>', 'Required number of validator signatures for a block to be valid')
.option('-m, --maxCoinSupply <amount>', 'Maximum amount of base currency in circulation')

const isParseableNumber = (numberString, base=10) =>{
    try{
        let number = parseInt(numberString, base)
        if(!isNaN(number)) return number;
        else return false
    }catch(e){
        return false
    }
}

const isParseableObject = (objectString) =>{
    try{
        let object = JSON.parse(objectString)
        if(object && typeof object === 'object') return object;
        else return false
    }catch(e){
        return false
    }
}

program
.command('difficulty <hex>')
.description('Set initial difficulty for block creation')
.action((hex)=>{
    if(hex && isParseableNumber(hex, 16)){
        genesis.difficulty = hex
        genesis.totalDifficulty = hex
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger('Saved genesis initial difficulty level:', hex)
    }else{
        throw new Error('Difficulty value must be hexadecimal')
    }
})

program
.command('validators <validatorsString>')
.description('Set initial difficulty for block creation')
.action((validatorsString)=>{
    if(validatorsString && isParseableObject(validatorsString)){
        console.log(JSON.stringify(genesis.validators))
        let validators = JSON.parse(validatorsString)
        genesis.validators = validators
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger('Accepted validators:', validators)
    }else{
        throw new Error('Validators object must be a valid object')
    }
})

program
.command('minimumSignatures <number>')
.description('Set initial difficulty for block creation')
.action((number)=>{
    if(number && isParseableNumber(number)){
        genesis.minimumSignatures = number
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger(`Set the minimum number of signatures required to ${number}`)
    }else{
        throw new Error('Minimum signature number must be a valid integer')
    }
})

program
.command('maxCoinSupply <amount>')
.description('Set initial difficulty for block creation')
.action((amount)=>{
    if(amount && isParseableNumber(amount)){
        genesis.maxCoinSupply = amount
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger(`Set the maximum number of coins in circulation to ${amount}`)
    }else{
        throw new Error('Maximum number of coins value must be a valid integer')
    }
})

program
.command('consensus <mode>')
.description('Set initial difficulty for block creation')
.action((mode)=>{
    if(mode){
        genesis.consensus = mode
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger('Consensus algorithm set to:', mode)
    }else{
        throw new Error('Consensus mode is required')
    }
})

program
.command('network <network>')
.description('Set initial difficulty for block creation')
.action((network)=>{
    if(network){
        genesis.network = network
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger('Network name set to:', network)
    }else{
        throw new Error('Network name is required')
    }
})

program
.command('password <password>')
.description('Set initial difficulty for block creation')
.action((password)=>{
    if(password){
        genesis.passwordHash = sha256(password)
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger('Network password set to:', password)
    }else{
        throw new Error('Network password is required')
    }
})

program
.command('blocktime <seconds>')
.description('Set ideal block creation time')
.action((seconds)=>{
    if(seconds && isParseableNumber(seconds)){
        genesis.blockTime = seconds
        genesis.hash = RecalculateHash(genesis)
        let saved = saveGenesisFile(genesis)
        if(saved.error) throw new Error(saved.error)
        else logger(`Saved genesis ideal block time to ${seconds} seconds`)
    }else{
        throw new Error('Block time value must be a valid integer')
    }
})

program.parse(process.argv)



/**
 * 
 * Here is a sample genesis block config file
 * You may change any value in it, though some value require recalculating the block hash
 * and some fields may required a value of a specific type
 * 
 * {
  "blockNumber": 0,
  "timestamp": 1554987342039,
  "transactions": {
    "maxCurrency": {
      "fromAddress": "coinbase",
      "toAddress": "coinbase",
      "amount": 1000000000000,
      "data": "Maximum allowed currency in circulation",
      "type": "coinbaseReserve",
      "hash": false,
      "miningFee": 0,
      "timestamp": 1554987342039,
      "nonce": 0,
      "delayToBlock": 0
    }
  },
  "actions": {},
  "previousHash": "",
  "totalDifficulty": "0x1024",
  "difficulty": "0x1024",
  "merkleRoot": "59C9BCB224111E86BC4DEA7ECE299BFAA5B1662E88D69BA898BAC09C16D7AD97",
  "nonce": 0,
  "hash": "09899ef0175512358bcee24d5a1c3db63f816ee5eec03bc977df3dd0cb06f7d0",
  "minedBy": "",
  "challenge": "7ee2825ab3eb2ed69d1e7b6a50ca38ffc08ebed2a60a6894b170c24ad79ae",
  "startMineTime": 1554987342039,
  "endMineTime": 0,
  "coinbaseTransactionHash": "",
  "signatures": {},
  "blockTime": 3,
  "consensus": "Permissioned",
  "network": "privatenet",
  "minimumSignatures": 1,
  "validators": {
    "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG": true,
    "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr": true,
    "AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6": true
  },
  "maxCoinSupply": 10000000000,
  "states": {
    "coinbase": {
      "balance": 1000000000000
    },
    "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG": {
      "balance": 10000
    },
    "AodXnC/TMkd6rcK1m3DLWRM14G/eMuGXWTEHOcH8qQS6": {
      "balance": 10000
    },
    "A2TecK75dMwMUd9ja9TZlbL5sh3/yVQunDbTlr0imZ0R": {
      "balance": 10000
    },
    "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr": {
      "balance": 10000
    }
  }
}
 */