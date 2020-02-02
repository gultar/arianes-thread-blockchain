#!/usr/bin/env node

const program = require('commander');
const ioClient = require('socket.io-client');
const NetworkManager = require('./modules/network/networkManager')
const NetworkToken = require('./modules/network/networkToken')
const { logger } = require('./modules/tools/utils')
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

program
    .command('join <network>')
    .description('Joins specific network according to configs found in config/netConfig.json')
    .action(async ( network )=>{
        if(nodeAddress){
            let manager = new NetworkManager()
            let started = await manager.init()
            let isKnownNetwork = manager.getNetwork(network)
            if(isKnownNetwork){
                let swapped = await manager.joinNetwork(network)
                let saved = await manager.save()
                logger(`Joined network ${network}`)
            }else{
                let genesis = require('./modules/tools/getGenesis')
                if(genesis.network == network){
                    let token = new NetworkToken(genesis)
                    let added = await manager.addNetwork(token)
                    let saved = await manager.save()
                    logger(`Added network ${network} from genesis block`)
                }else{
                    logger('ERROR: Could not find network '+network)
                }
            }
            

        }else{
            throw new Error('URL of active is required')
        }

    })

program
    .command('create <network>')
    .description('Joins specific network according to configs found in config/netConfig.json')
    .action(async ( network )=>{
        if(nodeAddress){
            let manager = new NetworkManager()
            let started = await manager.init()
            let genesis = require('./modules/tools/getGenesis')
            let token = new NetworkToken(genesis)
            let added = await manager.addNetwork(token)
            if(added.error) logger(added.error)
            else{
                logger(`Created new network: ${token.network}`)
            }

        }else{
            throw new Error('URL of active is required')
        }

    })

program.parse(process.argv)

