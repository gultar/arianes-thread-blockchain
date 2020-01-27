const NodeCore = require('./core')

const test = async () =>{
    let node1 = new NodeCore({
        host:'127.0.0.1',
        port:8000,
        httpsEnabled:true
    })

    let node2 = new NodeCore({
        host:'127.0.0.1',
        port:8001,
        httpsEnabled:true
    })

   await node1.init()
   await node2.init()
   await node1.connectToPeer(node2.address)
   let transaction = {
    "fromAddress": "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG",
    "toAddress": "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
    "type": "",
    "data": "",
    "timestamp": 1580149387690,
    "amount": 1,
    "nonce": 0,
    "hash": "75848c5542b1288feade4f1ae955ad8b6b47b28f6de8ef99cbb47f65eb047f6a",
    "miningFee": 0.0167,
    "delayToBlock": 0,
    "signature": "d/BxaFjnaAWvLZ4/sHBiBX2giwBBnJxAtHU+qg/U5nkROO9O4gN0JXEC9NX+9wWG2CoQS0IuDJbO1SRm+vIs5Q=="
  }
  
  
   setTimeout(()=>{
    node1.sendPeerMessage('transaction', JSON.stringify(transaction))
   }, 1000)
}

test()