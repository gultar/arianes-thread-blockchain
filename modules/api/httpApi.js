
const bodyParser = require('body-parser');
const RateLimit = require('express-rate-limit');
const { isValidTransactionCallJSON, isValidTransactionJSON, isValidActionJSON } = require('../tools/jsonvalidator')
/**
* HTTP REST API that can be used by clients to get data from blockchain and send transactions and actions
* @param {Object} $app - Express App
* @description - REST API to broadcast actions and transactions as well as querying for
*               information about them
*/
class HttpAPI{
    constructor({ chain, mempool, broadcastAction, broadcastTransaction, testAction, nodeList, getChainInfo }){
        this.chain = chain
        this.mempool = mempool
        this.nodeList = nodeList
        this.broadcastAction = broadcastAction
        this.broadcastTransaction = broadcastTransaction
        this.testAction = testAction
        this.getChainInfo = getChainInfo
        
    }


  initServiceAPI(app){
    try{
      let rateLimiter = new RateLimit({
        windowMs: 60 * 1000, //1 minute window 
        max: 100, // start blocking after 100 requests 
        message: "Too many requests per second"
      });

      app.use(rateLimiter);
      app.use(bodyParser.json());
      app.use(function (error, req, res, next) {
        if (error instanceof SyntaxError &&
          error.status >= 400 && error.status < 500 &&
          error.message.indexOf('JSON')) {
          res.send("ERROR: Invalid JSON format");
        } else {
          next();
        }
      });
      
      app.set('json spaces', 2)
      
      app.get('/transaction', async (req, res)=>{
        let tx = {};
        let pendingTx = {};
        let hash = req.query.hash;
        
        if(hash){
          tx = await this.chain.getTransactionFromDB(hash);
          if(tx){
            res.json(tx).end()
          }else{

            pendingTx = await this.mempool.getTransaction(hash);
            
            if(pendingTx){
              res.json(pendingTx).end()
            }else{
              res.json({ error:'no transaction found'}).end()
            }
            
          }
        }else{
          res.json({ error:'invalid transaction hash'}).end()
        }

      })
  
      app.post('/transaction', (req, res) => {
        
        try{
          if(isValidTransactionJSON(req.body) || isValidTransactionCallJSON(req.body)){
            let transaction = req.body
            
            this.broadcastTransaction(transaction, true)
            .then((transactionEmitted)=>{
              
              if(transactionEmitted.error){
                res.send(transactionEmitted.error)
              }else{
                if(transactionEmitted.value){
                  if(transactionEmitted.value) delete transactionEmitted.value.state
                  
                  let result = { result:transactionEmitted.value, receipt:transaction }
                  res.send(JSON.stringify(result, null, 2));
                }else if(transactionEmitted.isReadOnly){
                  let result = { isReadOnly:true, result:transactionEmitted.isReadOnly, receipt:transaction }
                  res.send(JSON.stringify(result, null, 2));
                }else{
                  let receipt = JSON.stringify(transaction, null, 2)
                  res.send(receipt);
                }
                
              }
            })
            .catch((e)=>{
              console.log(chalk.red(e));
            })
          }else{
            res.send('ERROR: Invalid transaction format')
          }
          
        }catch(e){
          console.log(chalk.red(e))
        }
        
      });

      app.post('/action', (req, res) => {
        
        try{
          if(isValidActionJSON(req.body)){
            let action = req.body
            
            this.broadcastAction(action)
            .then((actionEmitted)=>{
              if(!actionEmitted.error){
                res.send(JSON.stringify(actionEmitted, null, 2));
              }else{
                res.send({error:actionEmitted.error})
              }
            })

          }else{
            res.send('ERROR: Invalid transaction format')
          }
          
        }catch(e){
          console.log(chalk.red(e))
          res.send("ERROR: An Error occurred")
        }
        
      });

      app.post('/testAction', (req, res) => {
        
        try{
          if(isValidActionJSON(req.body)){
            let action = req.body
            
            this.testAction(action)
            .then((actionEmitted)=>{
              if(!actionEmitted.error){
                res.send(JSON.stringify(actionEmitted, null, 2));
              }else{
                res.send({error:actionEmitted.error})
              }
            })
          }else{
            res.send('ERROR: Invalid transaction format')
          }
          
        }catch(e){
          console.log(chalk.red(e))
          res.send("ERROR: An Error occurred")
        }
        
      })

      app.get('/getBlockHeader',(req, res)=>{
        var blockNumber = req.query.hash;
        if(blockNumber){
          res.json(this.chain.getBlockHeader(blockNumber)).end()
        }
      })

    }catch(e){
      logger(e)
    }
    
  }

   /**
    Exposes a set of endpoint to retrieve chain data or wallet data
    @param {Object} $app - Express server instance
  */
 initChainInfoAPI(app){
    app.get('/getWalletBalance', async(req, res)=>{
        let publicKey = req.query.publicKey;
        if(publicKey){
          let isAccount = await this.chain.accountTable.getAccount(publicKey);
          if(isAccount) publicKey = isAccount.ownerKey

          let state = await this.chain.balance.getBalance(publicKey);
          res.json(state).end()
        }else{
          res.json({error:'ERROR: must provide publicKey'}).end()
        }
      
    })

    app.get('/getWalletHistory', async(req, res)=>{
      if(isValidWalletBalanceJSON(req.query)){
        let publicKey = req.query.publicKey;
        if(publicKey){
          let history = await this.chain.getTransactionHistory(publicKey)
            res.json({ history:history }).end()
        }else{
          res.json({error:'ERROR: must provide publicKey'}).end()
        }
      }else{
        res.json({error:'ERROR: Invalid JSON request parameters'}).end()
      }
    })


    app.get('/getAddress', (req, res)=>{
      res.json({ nodes: this.nodeList.addresses }).end();
    })

    app.get('/getInfo', (req, res)=>{
      res.json(this.getChainInfo()).end()
    })

    app.get('/getBlock', (req, res)=>{
      console.log(req.protocol + '://' + "myDomain.com" + req.originalUrl)
      let blockNumber = req.query.blockNumber;
      if(blockNumber && typeof blockNumber == number){
        let block = this.chain.chain[blockNumber]
        if(block){
          res.json(block).end()
        }else{
          res.json({error:'block not found'}).end()
        }
        
      }
    })

    app.get('/getBlockHeader', (req, res)=>{
      let blockNumber = req.query.blockNumber;
      if(this.chain instanceof Blockchain && blockNumber && typeof blockNumber == number){
        let header = this.chain.getBlockHeader(blockNumber)
        if(header){
          res.json(header).end()
        }else{
          res.json({error:'block header not found'}).end()
        }
        
      }
    })
  }
}

module.exports = HttpAPI