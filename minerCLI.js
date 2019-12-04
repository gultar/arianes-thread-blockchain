#!/usr/bin/env node
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT

const Miner = require('./backend/classes/minertools/miner')
const program = require('commander');

program
    .option('-w, --walletName <walletName>', 'Name of the miner wallet')
    .option('-p, --password <password>', 'Password needed to unlock wallet')
    .option('-v, --verbose', 'Verbose level')

program
    .command('start')
    .description('Start mining')
    .action(( )=>{
        if(!program.walletName || !program.password) {throw new Error('Wallet name and password required to mine!'); return null;}
        if(!nodeAddress) throw new Error('Need to provide node port to connect to')
        let miner = new Miner({
            publicKey:program.publickey,
            verbose:true,
            keychain:{ name:program.walletName, password:program.password }
        })
        miner.connect(nodeAddress)

    })

program.parse(process.argv)

