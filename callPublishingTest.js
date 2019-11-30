let Transaction = require('./backend/classes/transaction')
const Wallet = require('./backend/classes/wallet')
const sha1 = require('sha1')
const activePort = require('dotenv').config({ path: './config/.env' }).parsed.API_PORT
const ioClient = require('socket.io-client');

let socketLife;
const openSocket = async (address, runFunction) =>{
    let socket = ioClient(address, {'timeout':10000, 'connect_timeout': 10000});
    socketLife = setTimeout(()=>{
        socket.close()
    },10000)
    if(socket){
        runFunction(socket);
    }else{
        console.log('Could not connect to node')
    }
}


let startTime = Date.now()
let endTiem = 0

let newWallet = new Wallet()

newWallet.importWalletFromFile(`./wallets/8003-${sha1('8003')}.json`)
.then(wallet =>{
    wallet.unlock('8003', 10)
    .then(async (unlocked)=>{
        if(unlocked){
            let txArray = []
            let transactions = {}
            openSocket('http://localhost:'+activePort, (socket)=>{
                socket.on('connect', async(connected)=>{

                    setInterval(async ()=>{
                        let transaction = new Transaction(
                            'tuor',
                            'Token',
                            1,
                            {
                                method:'issue',
                                params:{
                                    symbol:'YOLL',
                                    amount:10,
                                    receiver:'huor'
                                }
                            },
                            'call'
                        )
                        let signature = await wallet.sign(transaction.hash)
                        transaction.signature = signature;
                        // console.log(transaction)
                        // txArray.push(transaction)
                        transactions[transaction.hash] = transaction
                        socket.emit('transaction', transaction)
                    }, 20)

                    // socket.on('message', message => console.log(message))
                    // for(var i=0; i <= 10; i++){
                    //     let transaction = new Transaction(
                    //         'tuor',
                    //         'Token',
                    //         1,
                    //         {
                    //             method:'issue',
                    //             params:{
                    //                 symbol:'YOLL',
                    //                 amount:10,
                    //                 receiver:'huor'
                    //             }
                    //         },
                    //         'call'
                    //     )
                    //     let signature = await wallet.sign(transaction.hash)
                    //     transaction.signature = signature;
                    //     // console.log(transaction)
                    //     // txArray.push(transaction)
                    //     transactions[transaction.hash] = transaction
                        
                    // }

                    // socket.emit('testStack', transactions)

                    // // let counter = 0;
                    // socket.on('result', m => {
                    //     console.log(m)
                    //     endTime = Date.now()
                    //     let difference = endTime - startTime 
                    //     console.log(`Difference: ${difference} milliseconds`)
                    //     socket.close()
                    //     clearTimeout(socketLife)
                    // })
                    // // socket.on('transactionEmitted', )
                    // let send = setInterval(()=>{
                    //     let tx = txArray[counter]
                    //     socket.emit('transaction', tx)
                        
                    //     // console.log(tx)
                    //     counter++
                    //     if(counter == txArray.length) clearInterval(send)
                    // }, 40)
                })

                // socket.on('transactionEmitted', (receipt) => console.log(receipt))
            })
            
            
            
            
            
        }else{
            console.log('Could not unlock wallet')
        }
    })
})




