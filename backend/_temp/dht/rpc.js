const HTTP = require('http')
const SocketServer = require('socket.io')
const { logger } = require('../../tools/utils')
const sha1 = require('sha1')
// const RoutingTable = require('kademlia-routing-table')
// const KBucket = require('k-bucket')
const kad = require('kademlia-dht');
const Contact = kad.Contact;
const Dht = kad.Dht
const Id = kad.Id;
const io = require('socket.io-client')

function error(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
}

class RPC{
    constructor(opts){
        if(!opts) throw new Error('Host and port are required to instanciate RPC')
        let { host, port } = opts
        this.endpoint = `http://${host}:${port}`
        this.port = port
        this.http = HTTP.createServer()
        this.server = SocketServer(this.http, { transport:['websocket'] })
        // this.table = CreateNewRoutingTable(this.id)
        // this.table = this.initKBuckets()
        this.handlers = {}
        this.timeoutDelay = 5000
    }

    start(){
        logger(`RPC Interface listening on ${this.endpoint}`)
        this.server.listen(this.port)
        
        this.server.on('connection', (socket)=>{ 
            this.initRoutes(socket);
        })
    }

    static createID(){

        let buffer = randomBytes(20)
        console.log(Id)
        return new Id(buffer)
    }

    static createIDFromKey(key){
            return kad.Id.fromKey(key)
    }

    async send(message, endpoint, payload, cb){
        
        if (!endpoint) {
            return process.nextTick(function () {
                return cb(error('EINVALIDEP', 'invalid endpoint'));
            });
        }

        let result = await this.socketConnection(message, endpoint, payload)
        if(result.error) cb(result.error)

        cb(null, result)
        
       
    }

    async ping(endpoint, payload, cb){
        let socket = await this.socketConnection(endpoint)
        if(socket.error) cb(socket.error)
        socket.emit('request', { id:payload.id })
        socket.on('answer', (id)=>{
            cb(null, id)
        })


    }

    async store(endpoint, payload, cb){
        let result = await this.socketConnection('store', endpoint, payload)
        if(result.error) cb(result.error)

        cb(null, result)
    }

    async findNode(endpoint, payload, cb){
        let result = await this.socketConnection('findNode', endpoint, payload)
        if(result.error) cb(result.error)

        cb(null, result)
    }

    async findValue(endpoint, payload, cb){
        let result = await this.socketConnection('findValue', endpoint, payload)
        if(result.error) cb(result.error)

        cb(null, result)
    }

    socketConnection(endpoint, payload){
        return new Promise((resolve)=>{
            let socket = io(endpoint)
            
            if(socket){
                socket.on('connect', ()=>{
                    
                    clearTimeout(peerIsOffline)
                    resolve(socket)
                    
                })
                let peerIsOffline = setTimeout(()=>{
                    socket.destroy()
                    resolve({error:error('ETIMEDOUT', 'mock rpc timeout')})
                }, this.timeoutDelay)
            }else{
                resolve({error:error('ERRCONN', 'mock rpc ERROR')})
            }
        })
        
    }

    initRoutes(socket){
        
        socket.on('join', (address)=>{ this.onJoin(socket, address) })
        socket.on('findNode', (opts)=>{ this.onFindNode(socket, opts) })
        socket.on('findValue', (id)=>{ this.onFindValue(socket, id) })
        socket.on('put', (value)=>{ this.onPut(socket, value) })
        socket.on('get', (key)=>{ this.onGet(socket, key) })
        socket.on('leave', ()=>{ this.onLeave(socket) })
        socket.on('request', (payload)=> {
            socket.emit('answer', { remoteId: this.id })
        })
    }

    receive(message, handler){
        if (typeof handler === 'undefined')
            return this.handlers[message];
        if (this.handlers.hasOwnProperty(message))
            return { error:'a handler is already registered for: ' + message }
        this.handlers[message] = handler;
        
        
    }

    onFindNode(endpoint, payload, cb){

    }

    onFindValue(socket, id){
        
    }

    onStore(socket, payload){
        Dht.set(key, value, ()=>{
            
        })
    }

    // onLeave(socket, id){
    //     if(id){
    //         this.table.remove(id)
    //         socket.emit('result', { removed:true })
    //     }
    // }

    // numberOfKnownNodes(){
    //     let knownNodes = 0;
    //     this.table.rows.forEach(row =>{
    //         if(row.nodes){
    //             knownNodes += row.nodes.length
    //         }
    //     })

    //     return knownNodes
    // }

    // getRowOfIndex(index){
    //     // return new Promise((resolve)=>{
    //     //     this.table.rows.forEach( row=>{
    //     //         if(row.index == index) resolve(row);
    //     //     })
    
    //     //     resolve(false);
    //     // })
        
    // }

    extractIDPrefix(id){
        let prefix = id.substr(0, 20)
        let fullLengthPrefix = prefix + new Array((id.length + 1) - prefix.length).join('0')
        return fullLengthPrefix
    }
}

module.exports = RPC;



// console.log(myRPC)
let { randomBytes } = require('crypto')
function spawnDHT(rpc, seeds=[]){
    return new Promise(async (resolve)=>{
        kad.Dht.spawn(rpc, seeds, function (err, dht) {
            if(err) throw new Error(err)
            resolve(dht)
        });
    })
}

const tryOut = async () =>{
    let myRPC = new RPC({
        host:'127.0.0.1',
        port:8000,
    })
    myRPC.id = new Id(randomBytes(20))
    myRPC.contact = new Contact(myRPC.id, myRPC.endpoint)
    
    let myRPC2 = new RPC({
        host:'127.0.0.1',
        port:1221,
    })
    myRPC2.id = new Id(randomBytes(20))
    myRPC2.contact = new Contact(myRPC2.id, myRPC2.endpoint)
    // console.log(myRPC.id)
    // console.log(myRPC2.id)
    
    myRPC.start()
    myRPC2.start()
    

    let dht1 = await spawnDHT(myRPC)
    let dht2 = await spawnDHT(myRPC2, ['http://127.0.0.1:8000'])
    // console.log('Node 1',dht1)
    // console.log('Node 2',dht2)
    dht1.set('Hello', 'world', (err)=>{
        dht2.get('Hello', function (err, value) {
            console.log('%s === %s', 'world', value);
        });
    })
    
}
tryOut()



// setTimeout(()=>{
//     // console.log(dht1)
//     // console.log(dht2)
//     // console.log(Object.keys(dht1))
//     // dht1.set('beep', 'boop', function (err) {
//     //     dht2.get('beep', function (err, value) {
//     //         console.log('%s === %s', 'boop', value);
//     //     });
//     // });
// }, 4000)


// let myRPC = new RPC({
//     host:'127.0.0.1',
//     port:8200
// })

// myRPC.start()
// function getRandomIp(){
//     let address = new Array(4);
//     for(var i=0;i < address.length; i++){
//       address[i] = Math.floor(Math.random() * 255)
//     }
//     return address.join('.')
//   }
  
//   function getRandomPort(){
//       return Math.floor(Math.random() * 30000)
//     }
//   function addStuff(){
//       for(var i=0; i <= 21; i++){
//           let host = getRandomIp()
//           let port = getRandomPort()
//           let address = `http://${host}:${port}`
//           myRPC.table.add({
//               id:Buffer.from(sha1(address)),
//               host:host,
//               port:port,
//               timestamp:Date.now()
//           })
//       }
//   }

//   addStuff()
// let socket = require('socket.io-client')(myRPC.address)
// console.log('Created socket')
// socket.emit('put', {
//     address:'http://0.0.0.0:8001'
// })
// socket.on('result', (result)=>{
//     // console.log(result)
// })

// socket.emit('findNode', {
//     id:Buffer.from(sha1('http://0.0.0.0:8001'))
// })

// socket.on('peer', (node)=>{
//     // console.log(node)
// })

// let distance = BigInt(myRPC.table.distance(Buffer.from(sha1('http://0.0.0.0:8001')), Buffer.from(sha1('http://0.0.0.0:8000'))))
// console.log(distance)
