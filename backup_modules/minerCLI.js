#!/usr/bin/env node
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT

const Miner = require('./modules/classes/mining/miner/miner')
const program = require('commander');
const chalk = require('chalk')
const { logger } = require('./modules/tools/utils')
program
    .option('-w, --walletName <walletName>', 'Name of the miner wallet')
    .option('-p, --password <password>', 'Password needed to unlock wallet')
    .option('-v, --verbose', 'Verbose level')
    .option('-n, --numberOfCores [numCores]', 'Start a miner over multiple cpus. Default: 1 core')

program
    .command('start')
    .description('Start mining')
    .action(( )=>{
        
        let numberOfCores = 1
        if(program.numberOfCores){
            numberOfCores = parseInt(program.numberOfCores, 10)
            if(numberOfCores < 1 || isNaN(numberOfCores)) throw new Error('Number of cores must be a valid number')
        }

        let numOfAvailableCPUs = require('os').cpus()
        if(numberOfCores > numOfAvailableCPUs.length) 
            logger(chalk.red(`*** WARNING *** Number of mining cores exceeds the number of available CPUs`))
            
        if(!program.walletName || !program.password) {throw new Error('Wallet name and password required to mine!'); return null;}
        if(!nodeAddress) throw new Error('Need to provide node port to connect to')
        
        if(program.numberOfCores) console.log(`Starting miner with ${program.numberOfCores} active core${numberOfCores > 1? 's':''}`)
        let miner = new Miner({
            publicKey:program.publickey,
            verbose:true,
            keychain:{ name:program.walletName, password:program.password },
            numberOfCores: numberOfCores
        })
        miner.connect(nodeAddress)

    })

program.parse(process.argv)

