#!/usr/bin/env node

const Miner = require('./backend/classes/minertools/miner')
const program = require('commander');

program
    .option('-w, --walletName <walletName>', 'Name of the miner wallet')
    .option('-p, --password <password>', 'Password needed to unlock wallet')
    .option('-v, --verbose', 'Verbose level')

program
    .command('start <port>')
    .description('Start mining')
    .action(( port )=>{
        if(!program.walletName || !program.password) {throw new Error('Wallet name and password required to mine!'); return null;}
        
        let miner = new Miner({
            publicKey:program.publickey,
            verbose:program.verbose,
            keychain:{ name:program.walletName, password:program.password }
        })
        miner.connect('http://127.0.0.1:'+port)

    })

program.parse(process.argv)

