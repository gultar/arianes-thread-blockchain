const { logger, readFile } = require('../tools/utils')
const Wallet = require('./wallet');
const sha1 = require('sha1');
const ECDSA = require('ecdsa-secp256r1');
const fs = require('fs');
const Node = require('../../Node.js')


class WalletConnector{
  constructor(){
    this.wallets = {};
    this.connectors = {};
  }

  async createWallet(name, password=''){

    
    return new Promise(async (resolve, reject) =>{
      try{
        if(!name){
          logger(chalk.red('ERROR: Need to provide a wallet name'));
          resolve(false);
        }else{
          
        }

          fs.exists(`./wallets/${name}-${sha1(name)}.json`, async (alreadyExists)=>{
            if(!alreadyExists){
              let wallet = new Wallet();
              let created = await wallet.init(name);
              if(created){
                wallet.saveWallet(`./wallets/${name}-${wallet.id}.json`);
                this.wallets[wallet.publicKey] = wallet;
                logger(`Created wallet!`);
                logger(`Name: ${name}`);
                logger(`Public key: ${wallet.publicKey}`);
                logger(`Wallet id: ${wallet.id}`);
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
        
      }catch(e){
        console.log(e);
      }
    })

  }

  loadWallet(name){
    return new Promise((resolve, reject)=>{
      let wallet = new Wallet();
      wallet.importWalletFromFile(`./wallets/${name}-${sha1(name)}.json`)
      .then((wallet)=>{
        this.wallets[wallet.publicKey] = wallet;
        resolve(wallet);
      })
      .catch((e)=>{
        console.log(e);
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

  sign(walletName, data){
    if(this.wallets[walletName] && typeof data == 'string'){
      
      try{
        let wallet = this.wallets[walletName];
        return wallet.sign(data);
      }catch(e){
        console.log(e);
      }
      

    }
  }

  saveState(){
    logger('Saving wallet states')
    Object.keys(this.wallets).forEach(pubKey =>{
      let wallet = this.wallets[pubKey];
      if(wallet){
        wallet.saveWallet(`./wallets/${wallet.name}-${sha1(wallet.name)}.json`)
      }
    })
  }


}


module.exports = new WalletConnector()
