#!/usr/bin/env node

/********HTTP Server and protection************/
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const RateLimit = require('express-rate-limit');
const helmet = require('helmet');
//*********** Websocket connection**************/
const socketIo = require('socket.io')
const ioClient = require('socket.io-client');
const WalletManager = require('./backend/classes/walletManager'); //Instance not class
//************** Tools ************************/
const sha1 = require('sha1')
const {
  isValidTransactionJSON,
  isValidWalletRequestJSON,
  isValidCreateWalletJSON,
  isValidUnlockWalletJSON
} = require('./backend/tools/jsonvalidator')
const axios = require('axios');
const program = require('commander')



class KeyServer{
    constructor(){
        this.walletManager = new WalletManager();
        this.walletApi = express()
        this.socketServer = {}
        this.nodes = {}
        this.address = 'http://localhost:8003'
    }

    startServer(){
      if(this.nodes[0] == 'null') this.nodes = [] 
      let nodes = this.nodes;
      var http = require('http').Server(this.walletApi);
      var io = require('socket.io')(http);

      this.startHTTPServer()

      io.on('connection', function(socket){
        try{
          
          socket.on('message', message => console.log(message))
          let token = socket.handshake.query.token;
          if(typeof token == 'string') token = JSON.parse(token) 
          let address = token.address
          nodes[address] = socket;
          this.nodes = nodes
          console.log('User '+address+" is connected")
        }catch(e){
          console.log(e)
        }
        
      });

      http.listen(3000, function(){
        console.log('Keyserver listening on 3000');
        
      });
      
    }

    startHTTPServer(){
      
      this.walletApi.set('json spaces', 2);
      let rateLimiter = new RateLimit({
        windowMs: 1000, // 1 hour window 
        max: 30, // start blocking after 100 requests 
        message: "Too many requests per second"
      });
      this.walletApi.use(rateLimiter);

      this.walletApi.use(bodyParser.json());
      this.walletApi.use(function (error, req, res, next) {
        if (error instanceof SyntaxError &&
          error.status >= 400 && error.status < 500 &&
          error.message.indexOf('JSON')) {
          res.send("ERROR: Invalid JSON format");
        } else {
          next();
        }
      });

      this.walletApi.get('/', (req, res)=>{
        res.send({status:'Active'})
      })

      this.walletApi.post('/createWallet', (req, res)=>{
        
        if(isValidCreateWalletJSON(req.body)){
          const { name, password } = req.body;
          if(name && password){
            this.walletManager.createWallet(name, password)
            .then((wallet)=>{
              if(wallet){
                res.send(wallet)
              }else{
                res.send('ERROR: Wallet creation failed');
              }
              
            })
            .catch(e =>{
              console.log(e)
            })
          }else{
            res.send('ERROR: No wallet name or password provided')
          }
        }else{
          res.send('ERROR: Required parameters: walletname password ')
        }

      })

      this.walletApi.post('/unlockWallet', (req, res)=>{
        if(isValidUnlockWalletJSON(req.body)){
          const { name, password, seconds } = req.body;
          if(name && password){
                        
            this.walletManager.unlockWallet(name, password, seconds)
            .then((wallet)=>{
              if(wallet){
                res.send(`Wallet ${name} unlocked for ${( seconds ? seconds : 5)} seconds`);
              }else{
                res.send('ERROR: Wallet unlocking failed');
              }
              
            })
            .catch(e =>{
              console.log(e)
            })
          
          }else{
            res.send('ERROR: No wallet name or password provided. Optional: number of seconds')
          }
        }else{
          res.send('ERROR: Required parameters: walletname password. Optional: number of seconds ')
        }
 
      })
  
      this.walletApi.get('/getWalletPublicInfo', async (req, res)=>{

        if(isValidWalletRequestJSON(req.query)){
          let walletName = req.query.name;
          if(walletName){
            let wallet = await this.walletManager.getWalletByName(walletName);
            if(wallet){
              res.json(wallet).end();
            }else{
              res.json({error:`wallet ${walletName} not found`}).end()
            }
          }else{
            res.json({ error:'must provide wallet name' }).end()
          }
        }else{
          res.json({ error:'invalid JSON wallet creation format' }).end()
        }
        
      })
  
      this.walletApi.get('/loadWallet', async (req, res)=>{
        // if(isValidWalletRequestJSON(req.query)){
          try{
            if(isValidWalletRequestJSON(req.query)){
              let walletName = req.query.name;
              if(walletName){
                let filename = `./wallets/${walletName}-${sha1(walletName)}.json`
                let wallet = await this.walletManager.loadWallet(filename);
                console.log(`Loaded wallet ${walletName}`)
                res.json({loaded:wallet}).end();
              }else{
                res.json({ error:'must provide wallet name' }).end()
              }
            }else{
              res.json({ error:'invalid JSON wallet creation format' }).end()
            }

          }catch(e){
            console.log(e);
          }
        
      })

      this.walletApi.get('/getWalletBalance', async(req, res)=>{

        if(isValidWalletRequestJSON(req.query)){
          let walletName = req.query.name;
          if(walletName){
            let balance = await this.getBalance(walletName)
            if(balance){
              res.json(balance).end()
            }
          
          }else{
            res.json({ error:'must provide wallet name' }).end()
          }
        }else{
          res.json({ error:'invalid JSON wallet creation format' }).end()
        }

      })

      this.walletApi.get('/getWalletHistory', async(req, res)=>{
        if(isValidWalletRequestJSON(req.query)){
          let walletName = req.query.name;
          if(walletName){
            let history = await this.getHistory(walletName)
            if(history){
              res.json(history).end()
            }
          
          }else{
            res.json({ error:'must provide wallet name' }).end()
          }
        }else{
          res.json({ error:'invalid JSON wallet creation format' }).end()
        }
      })

      this.walletApi.get('/listWallets', async(req, res)=>{
        res.json(this.walletManager.wallets).end()
      })

      this.walletApi.get('/transaction', async (req, res)=>{
        let tx = {};
        let pendingTx = {};
        let hash = req.query.hash;
        if(hash){
          let transaction = await this.getTransaction(hash)
          if(transaction){
            res.json(transaction).end()
          }
        }else{
          res.json({error:'transaction hash is required'})
        }
        
      })
  
      this.walletApi.post('/transaction', async (req, res) => {
        
        try{
          if(isValidTransactionJSON(req.body)){
            let transaction = req.body
            let txSent = await this.forwardPostRequestToNode('/transaction', transaction);
            res.json(txSent).end()
          }else{
            res.send('ERROR: Invalid transaction format')
          }
          
        }catch(e){
          console.log(chalk.red(e))
        }
        
      });
      
      
    }

    forwardGetRequestToNode(route, params){
      return new Promise(async (resolve, reject)=>{
        if(route && params && this.nodes){
          axios.get(this.address+route,{
            params:params
          })
          .then( response=>{
            resolve(response.data)
          })
          .catch(e=> {
            console.log(e)
            resolve({error:'an error occured'})
          })
        }
        
      })
     
    }

    forwardPostRequestToNode(route, params){
      return new Promise((resolve, reject)=>{
        if(route && params && this.nodes){
          axios.post(this.address+route,params)
          .then( response=>{
            resolve(response.data)
          })
          .catch(e=> {
            console.log(e)
            resolve({error:'an error occured'})
          })
        }
        
      })
     
    }

    async getBalance(walletName){
      return new Promise(async (resolve, reject)=>{
        if(this.nodes){
          let publicKey = await this.walletManager.getPublicKeyOfWallet(walletName)
          
          if(!publicKey){
            let wallet = await this.walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`)
            let data = await this.forwardGetRequestToNode('/getWalletBalance', {publicKey:wallet.publicKey})
            resolve(data);
          }else{
            let data = await this.forwardGetRequestToNode('/getWalletBalance', {publicKey:publicKey})
            resolve(data);
          }
          
          
        }else{
          console.log('ERROR: Need at least one active node to get balance')
        }
      })
      
    }

    async getHistory(walletName){
      return new Promise(async (resolve, reject)=>{
        if(this.nodes){
          let publicKey = await this.walletManager.getPublicKeyOfWallet(walletName)
          
          if(!publicKey){
            let wallet = await this.walletManager.loadWallet(`./wallets/${walletName}-${sha1(walletName)}.json`)
            let data = await this.forwardGetRequestToNode('/getWalletHistory', {publicKey:wallet.publicKey})
            resolve(data);
          }else{
            let data = await this.forwardGetRequestToNode('/getWalletHistory', {publicKey:publicKey})
            resolve(data);
          }
          
          
        }else{
          console.log('ERROR: Need at least one active node to get balance')
        }
      })
      
    }

    getTransaction(hash){
      return new Promise((resolve, reject)=>{
        if(this.nodes){
          let addresses = Object.keys(this.nodes);
          let randIndex = Math.floor(Math.random()) * addresses.length;
          let address = (this.nodes[randIndex] ? this.nodes[randIndex]:'http://localhost:8003')
          axios.get(this.address+'/transaction',{
            params:{
              hash:hash
            }
          })
          .then( response=>{
            resolve(response.data)
          })
          .catch(e=> {
            console.log(e)
            resolve({error:'an error occured'})
          })
        }else{
          console.log('ERROR: Need at least one active node to get history')
        }
      })
    }

    setTargetAddress(address){
      if(address && typeof address == 'string'){
        this.address = address;
      }else{
        console.log('ERROR: Valid IP address required')
      }
    }


}

let server = new KeyServer()


// program
// .command('setip <ip>')
// .action((ip)=>{
//   if(ip){
//     server.setTargetAddress(ip)
//   }
// })

server.startServer()
