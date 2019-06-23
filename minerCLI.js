#!/usr/bin/env node
// const Mempool = require('./backend/classes/mempool')
const SelfMiner = require('./backend/classes/minertools/selfminer')
const ECDSA = require('ecdsa-secp256r1');
const program = require('commander');
const fs = require('fs');
const express = require('express');
const http = require('http');

program
    
    // .option('-k, --publickey <publicKey>', 'Wallet provided to sign coinbase transactions')
    .option('-w, --walletName <walletName>', 'Name of the miner wallet')
    .option('-p, --password <password>', 'Password needed to unlock wallet')
    .option('-v, --verbose', 'Verbose level')

program
    .command('start <port>')
    .description('Start mining')
    .action(( port )=>{
        if(!program.walletName || !program.password) {throw new Error('Wallet name and password required to mine!'); return null;}
        console.log('Starting miner')
        let miner = new SelfMiner({
            publicKey:program.publickey,
            verbose:program.verbose,
            keychain:{ name:program.walletName, password:program.password }
        })
        console.log('Connecting to ', 'http://127.0.0.1:'+port)
        miner.connect('http://127.0.0.1:'+port)

    })

program.parse(process.argv)

