#!/usr/bin/env node
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT

const Validator = require('./modules/classes/validating/validator')
const program = require('commander');
const chalk = require('chalk')
const { logger } = require('./modules/tools/utils')
let validator;
program
    .option('-w, --walletName <walletName>', 'Name of the validator wallet')
    .option('-p, --password <password>', 'Password needed to unlock wallet')
    .option('-v, --verbose', 'Verbose level')
    .option('-e, --emptyBlocks', 'Generate block containing a single coinbase')

program
    .command('start')
    .description('Start mining')
    .action(( )=>{
        
        let numberOfCores = 1
            
        if(!program.walletName || !program.password) {throw new Error('Wallet name and password required to mine!'); return null;}
        if(!nodeAddress) throw new Error('Need to provide node port to connect to')
        
        if(program.numberOfCores) console.log(`Starting validator with ${program.numberOfCores} active core${numberOfCores > 1? 's':''}`)
        validator = new Validator({
            publicKey:program.publickey,
            verbose:true,
            keychain:{ name:program.walletName, password:program.password },
            numberOfCores: numberOfCores
        })
        validator.connect(nodeAddress)

    })

program.parse(process.argv)

process.on('SIGINT', async () =>{
    validator.disconnect()
    process.exit()
})

