#!/usr/bin/env node
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT

const Generator = require('./modules/classes/generating/generator')
const program = require('commander');
const chalk = require('chalk')
const { logger } = require('./modules/tools/utils')
let generator;
program
    .option('-w, --walletName <walletName>', 'Name of the Generator wallet')
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
        
        generator = new Generator({
            publicKey:program.publickey,
            verbose:true,
            keychain:{ name:program.walletName, password:program.password },
            numberOfCores: 1
        })
        generator.connect(nodeAddress)

    })

program.parse(process.argv)

process.on('SIGINT', async () =>{
    generator.disconnect()
    process.exit()
})

