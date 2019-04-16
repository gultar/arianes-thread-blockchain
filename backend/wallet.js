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
        this.transactions = {}
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

    async init(seed){
        
        let secretSeed = (seed ? seed : this.generateEntropy())
        
        return new Promise(async (resolve, reject)=>{
            try{
                this.privateKey = await ECDSA.generateKey(secretSeed);
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
        
    }

    async initFromJSON(json){
        return new Promise(async (resolve, reject)=>{
            if(json){
                try{
                    this.id = json.id;
                    this.publicKey = json.publicKey;
                    this.transactions = json.transactions;
                    this.privateKey = ECDSA.fromJWK(json.privateKey);

                    resolve(true)
                }catch(e){
                    logger(e);
                    reject(e);
                }
                
            }
        })
        
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
                          resolve(err)
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
                            resolve(false);
                          }
                        });
                    }catch(e){
                        logger(e);
                        resolve(false)
                    }
                }
            })
        })
        
    }
  
  }

  module.exports = Wallet