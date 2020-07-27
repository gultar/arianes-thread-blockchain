#!/usr/bin/env node

const program = require('commander');
const ioClient = require('socket.io-client');
const NetworkManager = require('./modules/network/networkManager')
const NetworkConfig = require('./modules/network/netConfig')
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
            let manager = new NetworkManager(network)
            let managerStarted = await manager.init()
            let config = new NetworkConfig(network)
            let loadedConfig = await config.loadNetworkConfig()
            if(loadedConfig.error) throw new Error(loadedConfig.error)
            
            let joined = await manager.joinNetwork(config.token)
            if(joined.error) throw new Error(joined.error)
            let saved = await manager.save()
            if(saved.error) throw new Error(saved.error)
            logger(`Joined network ${network}`)
        }else{
            throw new Error('URL of active is required')
        }

    })

program
    .command('create <network>')
    .description('Joins specific network according to configs found in config/netConfig.json')
    .action(async ( network )=>{
        if(nodeAddress){
            let manager = new NetworkManager(network)
            let started = await manager.init()
            let genesis = require('./modules/tools/getGenesis')
            let token = new NetworkToken(genesis)
            console.log(token)
            let created = manager.createNetwork(token)
            if(created.error) throw new Error(created.error)
            logger(`Created new network: ${token.network}`)

        }else{
            throw new Error('URL of active is required')
        }

    })

program.parse(process.argv)

