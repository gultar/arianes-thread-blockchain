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
    wallet.unlock('8003', 1000)
    .then(async (unlocked)=>{
        if(unlocked){
            let txArray = []
            let transactions = {}
            openSocket('http://localhost:'+activePort, (socket)=>{
                socket.on('connect', async(connected)=>{
                    
                    socket.on('transactionEmitted', message => console.log(message))
                    for(var i=0; i <= 10; i++){
                        let transaction = new Transaction(
                            'tuor',
                            'Token',
                            1,
                            {
                                method:'issue',
                                params:{
                                    symbol:'GOLD',
                                    amount:10,
                                    receiver:'huor'
                                }
                            },
                            'call'
                        )
                        let signature = await wallet.sign(transaction.hash)
                        transaction.signature = signature;
                        socket.emit('transaction', transaction)
                        
                        let transaction2 = new Transaction(
                            'tuor',
                            'Storage',
                            1,
                            {
                                method:'set',
                                params:{
                                    id:'id'+i,
                                    data:{
                                        [transaction.data.method]:transaction.data.params
                                    }
                                }
                            },
                            'call'
                        )
                        let signature2 = await wallet.sign(transaction2.hash)
                        transaction2.signature = signature2;

                        // console.log(transaction2)
                        socket.emit('transaction', transaction2)
                        
                    }

            
                })

            })
            
            
            
            
            
        }else{
            console.log('Could not unlock wallet')
        }
    })
})




