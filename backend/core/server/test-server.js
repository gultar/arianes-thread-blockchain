const CoreServer = require('./server')

const test = async () =>{
    let myServer = new CoreServer({
        host:'127.0.0.1',
        port:8000,
        config:{
            httpsEnabled:true
        }
    })

    await myServer.start()
    
    let myServer2 = new CoreServer({
        host:'127.0.0.1',
        port:8001,
        config:{
            httpsEnabled:true
        }
    })

    await myServer2.start()

    let myServer3 = new CoreServer({
        host:'127.0.0.1',
        port:8002,
        config:{
            httpsEnabled:true
        }
    })

    await myServer3.start()
    
    await myServer.connectToPeer(myServer2.address)
    await myServer.connectToPeer(myServer3.address)
    setTimeout(()=>{
        myServer.broadcast('message','Hello motherfuckers')
    },1000)
}

test()