
const PeerConnection = require('socket.io-client')
const RPC = require('./rpc')
const { logger } = require('../../tools/utils')
const sha1 = require('sha1')
var kad = require('kademlia-dht');

class DhtNode extends RPC{
    constructor(opts){
        super(opts)
        this.bootstrapNodes = []
        this.connections = {}
        this.timeoutDelay = 5000
    }

    shortConnection(address){
        return new Promise((resolve)=>{
            if(address != this.address){
                let socket = PeerConnection(address)
                socket.on('connect', ()=>{
                    clearTimeout(peerIsOffline)
                    resolve(socket)
                })
                let peerIsOffline = setTimeout(()=>{
                    socket.destroy()
                    resolve(false)
                }, this.timeoutDelay)
            }else{
                resolve(false)
            }
            
        })
        
    }

    connection(address){
        return new Promise((resolve)=>{
            if(address != this.address){
                let socket = PeerConnection(address)
                socket.on('connect', async()=>{
                    console.log('Connected to node ', address)
                    let newNodes = await this.findNode(socket, this.id)
                    
                    newNodes.forEach( node=> {
                        if(node){
                            if(!this.table.has(node.id)){
                               let added = this.table.add(node)
                               console.log(`Added node ${node.id} : ${added}`)
                            }
                        }
                    })
                    clearTimeout(peerIsOffline)
                    resolve(socket)
                })
                let peerIsOffline = setTimeout(()=>{
                    socket.destroy()
                    resolve(false)
                }, this.timeoutDelay)
            }else{
                resolve(false)
            }
            
        })
    }

    async joinNetwork(startIndex=0){
        let bootstrapAddress = this.bootstrapNodes[startIndex]
        if(bootstrapAddress){
            let socket = await this.shortConnection(bootstrapAddress)
            if(!socket) this.joinNetwork(startIndex+1)

            this.connectToBootstrap(socket, bootstrapAddress)
            
        }else{
            logger('ERROR: Bootstrap failed')
        }
    }
    
    connectToBootstrap(socket, bootstrapAddress){
        
        socket.emit('join', {
            id:this.id,
            address:this.address
        })
        socket.on('id', async (id)=>{
            this.table.add({
                id:id,
                address:bootstrapAddress
            })

            let bootstrapSocket = await this.shortConnection(bootstrapAddress)
            if(bootstrapSocket){
                console.log('Connected to bootstrap node')
                let moreNodes = await this.buildRoutingTable(bootstrapSocket)
                console.log(`Got ${moreNodes.length} more nodes`)
                
                // this.requestMoreNodes(moreNodes)
            }
            // let newNodes = await this.findNode(socket, id)
            // if(newNodes){
            //     newNodes.forEach( async(node) =>{
            //         this.table.add(node)
            //     })

            //     this.selfLookup()
            // }
           
        })

        return socket;
    }


    findNode(socket, id, quantity){
        return new Promise((resolve)=>{
            socket.emit('findNode', {
                id:id, 
                quantity:quantity
            })
            socket.on('peer', (peer)=>{
                if(peer){
                    clearTimeout(requestTimeout)
                    socket.off('peer')
                    resolve(peer)
                }
            })

            let requestTimeout = setTimeout(()=>{
                socket.off('peer')
                resolve({error:`ERROR: Could not find peer ${id}`})
            }, this.timeoutDelay)
        })
    }

    async selfLookup(){
        let closestNodes = this.table.closest(this.id)
        closestNodes.forEach( async(node) =>{
            let socket = await this.shortConnection(node.address)
            if(socket){
                let newNodes = await this.findNode(socket, this.id)
                if(newNodes){
                    newNodes.forEach( node=>{
                        this.table.add(node)
                    })

                }
            }
        })
    }

    requestMoreNodes(nodes){


    }

    
    async buildRoutingTable(bootstrapSocket){
        return new Promise(async (resolve)=>{
            let numRows = this.table.rows.length;
            let startingNodes = await this.findNode(bootstrapSocket, this.id)
            let newNodes = []
            
            if(startingNodes){
                startingNodes.forEach( async(node) =>{
                    let socket = await this.shortConnection(node.address)
                    if(socket){
                        console.log('Has connection to ', node.address)
                        let moreNodes = await this.findNode(socket, this.id)
                        
                        newNodes.push.apply(moreNodes)
                    }
                })
                resolve(newNodes)
            }else{
                resolve('BOOM')
            }

            
        })
        
    }


}

module.exports = DhtNode;

let myRPC = new RPC({
    host:'127.0.0.1',
    port:'8000'
})

myRPC.start()

// function getRandomIp(){
//   let address = new Array(4);
//   for(var i=0;i < address.length; i++){
//     address[i] = Math.floor(Math.random() * 255)
//   }
//   return address.join('.')
// }

function getRandomPort(){
  return Math.floor(Math.random() * 30000)
}
// for(var i=0; i < 20; i++){
//     let host = getRandomIp()
//     let port = getRandomPort()
//     let address = `http://${host}:${port}`
//     let newNode = {
//         id:sha1(address),
//         address:address
//     }

//     myRPC.table.add(newNode)
// }

function spawnNodes(number){
    let rpcNodes = {}
    let qty = number
    for(var i=0; i < qty; i++){
        let host = '127.0.0.1';
        let port = getRandomPort()
        let node = new RPC({
            host:host,
            port:port
        })
        rpcNodes[node.address] = node
        rpcNodes[node.address].start()
    }
    console.log(`Spawning ${qty} nodes`)
    return rpcNodes
}

function connectNodes(rpcNodes, toNode){
    let allAddresses = Object.keys(rpcNodes)
    let qty = allAddresses.length;
    allAddresses.forEach( addr=>{
        let node = rpcNodes[addr]
        let index = allAddresses.indexOf(addr)
        if(index > 0){
            let previousNode = rpcNodes[allAddresses[ index - 1 ]]
            let addedToPrevious = previousNode.table.add({
                id:node.id,
                address:node.address
            })
            // console.log(`New node added ${node.id} to previous node ${previousNode.id}'s table : ${addedToPrevious}`)
        }else{
            let lastNode = rpcNodes[allAddresses[qty - 1]]
            let addedToLast = lastNode.table.add({
                id:node.id,
                address:node.address
            })
            // console.log(`New node added ${node.id} to last node ${lastNode.id}'s table : ${addedToLast}`)
        }
        
        let added = toNode.table.add({
            id:node.id,
            address:node.address
        })
        // console.log(`New node added ${node.id} to node ${toNode.id}'s table : ${added}`)
    })

    return true;
}


let myNode = new DhtNode({
    host:'127.0.0.1',
    port:'8001'
})

let nodes = spawnNodes(5)

connectNodes(nodes, myRPC)



let myRPC2 = new RPC({
    host:'0.0.0.0',
    port:'8020'
})

let otherNodes1 = spawnNodes(5)
connectNodes(otherNodes1,myRPC2)

let myRPC3 = new RPC({
    host:'0.0.0.0',
    port:'8015'
})

let otherNodes2 = spawnNodes(5)
connectNodes(otherNodes2,myRPC3)

let myRPC4 = new RPC({
    host:'0.0.0.0',
    port:'8010'
})

let otherNodes3 = spawnNodes(5)
connectNodes(otherNodes3,myRPC4)

myRPC.table.add({
    id:sha1(`http://$0.0.0.0:8020`),
    address:`http://$0.0.0.0:8020`
})
myRPC.table.add({
    id:sha1(`http://$0.0.0.0:8015`),
    address:`http://$0.0.0.0:8015`
})
myRPC.table.add({
    id:sha1(`http://$0.0.0.0:8010`),
    address:`http://$0.0.0.0:8010`
})
// console.log(myRPC.table.get(sha1(`http://$0.0.0.0:8010`)))


myNode.bootstrapNodes.push(myRPC.address)
myNode.joinNetwork()
// console.log(myRPC.table.rows)
// myRPC.getRowOfIndex(5)
// .then( row=>{
//     console.log(row)
    
// })

