const ECDSA = require('ecdsa-secp256r1');
const { logger } = require('./utils');
const sha256 = require('./sha256');
const sha1 = require('sha1');
const { encrypt, decrypt } = require('./utils')
const fs = require('fs')

class Wallet{
    
    constructor(){
        this.id = '';
        this.privateKey = '';
        this.publicKey = '';
    }

    generateEntropy(){
        var randomGen = '';
        for(var i=0; i<100; i++){
            var nonce = Math.floor(Date.now()*Math.random()*100*Math.random());
            nonce = nonce.toString();
            randomGen = randomGen.concat(nonce);

        }
        return randomGen;
    }

    async generatePrivateKey(){
        if(!this.privateKey){
            
        }
    }
  
    generateAddress(){
        if(!this.publicKey){
            
        }
    }

    generateID(){
        if(!this.id && this.publicKey){
            this.id = sha1(this.publicKey);
        }
    }

    async getWallet(){
        let wallet = this;
        return wallet;
    }

    async init(){
        return new Promise(async (resolve, reject)=>{
            try{
                this.privateKey = await ECDSA.generateKey(this.generateEntropy());
                this.publicKey = await this.privateKey.toCompressedPublicKey();
                this.id = await sha1(this.publicKey);
                if(this.privateKey && this.publicKey && this.id){
                    resolve(this);
                }else{
                    resolve(false);
                }
            }catch(e){
                logger(e);
                resolve(false);
            }
            
            
        })
        
        // this.generatePrivateKey().then(()=>{
        //     this.generateAddress();
        //     this.generateID();
            
        // });

        
    }

    async sign(data){
        if(data && this.privateKey){
            let signature = ''
            try{
                if(typeof data == 'object'){
                    let message = JSON.stringify(data);
                    signature = this.privateKey.sign(message)

                }else if(typeof data == 'string'){
                    signature = this.privateKey.sign(data)
                }
                
                return signature;

            }catch(e){
                logger(e)
            }
        }
    }

    saveWallet(filename){
        if(this.publicKey && this.privateKey && filename){
            
            this.privateKey = this.privateKey.toJWK();
            
            let walletString = JSON.stringify(this, null, 2);
            var wstream = fs.createWriteStream(filename);

            wstream.write(walletString);
            wstream.end();
        }else{
            logger('ERROR: cannot save empty wallet');
            
        }
    }

    async loadWalletFromFile(pathAndFilename){
        return new Promise((resolve, reject)=>{
            fs.exists(pathAndFilename, (exists)=>{
                if(exists){
                    try{
                        var data = '';
                        var rstream = fs.createReadStream(pathAndFilename);
              
                        rstream.on('error', (err) =>{
                          logger(err);
                          reject(err)
                        })
              
                        rstream.on('data', (chunk) => {
                          data += chunk;
                        });
              
              
                        rstream.on('close', () =>{  // done
                          if(data != undefined){
                              let wallet = JSON.parse(data);
                              this.publicKey = wallet.publicKey;
                              this.privateKey = ECDSA.fromJWK(wallet.privateKey);
                              this.id = wallet.id;
                              resolve(wallet);
                          }else{
                            reject(false);
                          }
                        });
                    }catch(e){
                        logger(e);
                    }
                }
            })
        })
        
    }
  
  }

  
  

  const checkOutWallet = async ()=>{
    let myWallet = new Wallet();
    myWallet.init().then(async ()=>{
        console.log(myWallet);
        let message = { test:'hello world' };
        let message2 = 'hello world';
        let signature = await myWallet.sign(message);
        let signature2 = await myWallet.sign(message2);
        console.log(signature);
        console.log(signature2);
        setTimeout(()=>{
            myWallet.saveWallet();
        },3000)
    });
  }

  const load = (file) =>{
    let myWallet = new Wallet();
    myWallet.loadWalletFromFile(file)
    .then((wallet)=>{
        if(wallet){
            console.log(wallet)
            console.log(myWallet)
        }
    })
  }
 
  //checkOutWallet();
  //load()

  module.exports = Wallet