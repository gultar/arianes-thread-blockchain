const { logger } = require('../tools/utils')
const ECDSA = require('ecdsa-secp256r1');
const Wallet = require('./wallet');
const sha1 = require('sha1')
const fs = require('fs');


class WalletManager{
  constructor(){
    this.wallets = {};
    this.connectors = {};
  }

  async createWallet(name, password){
    
    return new Promise(async (resolve, reject) =>{
      
      try{
        if(!name || !password){
          logger(chalk.red('ERROR: Need to provide a wallet name and a password'));
          resolve(false);
        }else{
          
          fs.exists(`./wallets/${name}-${sha1(name)}.json`, async (alreadyExists)=>{
            if(!alreadyExists){
              let wallet = new Wallet();
              let created = await wallet.init(name, password);
              if(created){
                wallet.saveWallet(`./wallets/${name}-${wallet.id}.json`);
                this.wallets[wallet.publicKey] = wallet;
                resolve(wallet);
              }else{
                logger('ERROR: Could not create wallet')
                resolve(false)
              }
            }else{
              logger('ERROR: Wallet already exists')
              resolve(false);
            }
         })
        }

      }catch(e){
        console.log(e);
      }
    })

  }

  


  loadWallet(filename){
    return new Promise((resolve, reject)=>{
      let wallet = new Wallet();
      wallet.importWalletFromFile(filename)
      .then((wallet)=>{
        this.wallets[wallet.publicKey] = wallet;
        resolve(wallet);
      })
      .catch((e)=>{
        console.log(e);
      })
    })
  }

  loadByWalletName(walletName){
    return new Promise((resolve, reject)=>{
      let filename = `./wallets/${walletName}-${sha1(walletName)}.json`
      let wallet = new Wallet();
      wallet.importWalletFromFile(filename)
      .then((wallet)=>{
        this.wallets[wallet.publicKey] = wallet;
        resolve(wallet);
      })
      .catch((e)=>{
        console.log(e);
        resolve(false)
      })
    })
  }

  getWalletByName(name){
    return new Promise((resolve, reject)=>{
      if(name && this.wallets){
        let id = sha1(name);
        Object.keys(this.wallets).forEach((pubKey)=>{
          let wallet = this.wallets[pubKey];

          if(wallet.id == id){
            resolve(wallet)
          }

        })
        resolve(false);
      }
    })
    
  }

  unlockWallet(name, password, seconds=5){
    return new Promise(async (resolve, reject)=>{
      if(name && password){
      
        let wallet = await this.getWalletByName(name);
        
        if(wallet){
           let unlocked = await wallet.unlock(password, seconds);
           resolve(unlocked)
        }else{
          resolve(false)
        }
      }else{
        resolve(false)
      }
    })

  }

  getWalletByPublicAddress(publicAddress){
    if(publicAddress && this.wallets){
      return this.wallets[publicAddress]
    }else{
      logger('Connector does not contain wallets')
    }
  }

  getPublicKeyOfWallet(name){
    return new Promise((resolve, reject)=>{
      if(name && this.wallets){

        Object.keys(this.wallets).forEach((pubKey)=>{
          let wallet = this.wallets[pubKey];

          if(wallet.name == name){
            resolve(wallet.publicKey)
          }

        })
        resolve(false);
      }
    })
  }

  sign(publicKey, data, password){
    if(this.wallets[publicKey] && typeof data == 'string'){
      
      try{
        let wallet = this.wallets[publicKey];
        return wallet.sign(data, password);
      }catch(e){
        console.log(e);
      }
    }
  }

  verify(compressedKey, data, signature){
    return new Promise((resolve, reject)=>{
      const publicKey = ECDSA.fromCompressedPublicKey(compressedKey);
      resolve(publicKey.verify(data, signature))
    })
  }

  saveState(){
    return new Promise(async (resolve, reject)=>{
      try{
        Object.keys(this.wallets).forEach(async (pubKey) =>{
          let wallet = this.wallets[pubKey];
          if(wallet){
            let saved = await wallet.saveWallet(`./wallets/${wallet.name}-${sha1(wallet.name)}.json`)
            if(saved.error) reject(saved.error)
          }
        })
        logger('Saved wallet states')
        resolve(true)
      }catch(e){
        reject(e)
      }
      
    })
    
  }


}


module.exports = WalletManager
