#!/usr/bin/env node
// const Mempool = require('./backend/classes/mempool')
const SelfMiner = require('./backend/classes/minertools/selfminer')
const ECDSA = require('ecdsa-secp256r1');
const program = require('commander');
const fs = require('fs');
const express = require('express');
const http = require('http');

program
    
    .option('-k, --publickey <publicKey>', 'Wallet provided to sign coinbase transactions')
    .option('-p, --password <password>', 'Password needed to unlock wallet')
    .option('-v, --verbose', 'Verbose level')

program
    .command('start')
    .description('Start mining')
    .action(( )=>{
        console.log('Starting miner')
        let miner = new SelfMiner({
            publicKey:program.publickey,
            verbose:program.verbose,
        })
        miner.connect('http://localhost:3000')

    })

program.parse(process.argv)

