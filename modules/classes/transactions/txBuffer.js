const EventEmitter = require('events')


class TransactionBuffer{
    constructor(){
        this.buffer = new Map()
        this.events = new EventEmitter()
    }

    addToBuffer(transaction){
        this.buffer.set(transaction.hash, transaction)
        this.events.emit('txAdded')
    }

    async gatherTransactions(){
        let iterator = this.buffer.values()
        let transactions = []
        for await(let transaction of iterator){
            transactions.push(transaction)
        }

        this.buffer.clear()
        return transactions
    }
}

let buf = new TransactionBuffer()

buf.events.on('txAdded', ()=>{
    //console.log('Size of buffer', buf.buffer.size)
})
let max = 10000
let counter = 0

setInterval(()=>{
    counter ++ 
    if(counter <= max) buf.addToBuffer({ hash:counter, content:'blabla' })
}, 0)


setInterval(async ()=>{
    let tx = await buf.gatherTransactions()
    console.log(tx.length)
}, 0)