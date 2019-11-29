#!/usr/bin/env node

const program = require('commander');
const ioClient = require('socket.io-client');
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT

const openSocket = async (address, runFunction) =>{
    let socket = ioClient(address, {'timeout':1000, 'connect_timeout': 1000});
    setTimeout(()=>{
        socket.close()
    },1000)
    if(socket){
        runFunction(socket);
    }else{
        console.log('Could not connect to node')
    }
}

program
    .option('-u, --url <url>', 'URL Of active blockchain node')

program
    .command('lookupPeers <method>')
    .description('Start mining')
    .action(( method )=>{
        if(nodeAddress){
            openSocket(nodeAddress, (socket)=>{
                if(method == 'DHT' || method == 'dht'){
                    console.log("Node is now looking for peers on Bittorrent's DHT")
                    socket.emit('startLookingForPeers', 'dht')
                }else if(method == 'DNSSD' || method == 'dnssd' || method == 'local'){
                    socket.emit('startLookingForPeers', 'dnssd')
                }else{
                    throw new Error('Unknown peer discovery method')
                }
            })

        }else{
            throw new Error('URL of active is required')
        }

    })

program
    .command('connect <address>')
    .description('Connect to remote peer')
    .action(( address )=>{
        if(nodeAddress){
            openSocket(nodeAddress, (socket)=>{
                if(address){
                    socket.emit('connectionRequest', address)
                }
            })

        }else{
            throw new Error('URL of active is required')
        }

    })

program.parse(process.argv)

