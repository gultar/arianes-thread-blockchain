const readline = require('readline');
const sha256 = require('./sha256');
const { logger } = require('./utils')
const { encrypt, decrypt, getPublicKey } = require('./keysHandler');
const Wallet = require('./wallet');

class WalletConnector{
  constructor(){
    this.wallets = {};
    this.connectors = {};
  }

  async createWallet(seed){
    let wallet = new Wallet();
    let created = await wallet.init(seed);
    
  }

  getWalletByID(id){
    if(id && this.wallets){
      return this.wallets[id]
    }else{
      logger('Connector does not contain wallets')
    }
  }

  getWalletByPublicAddress(publicAddress){
    if(publicAddress & this.wallets){
      let ids = Object.keys(this.wallets);
      for(var id in ids){
        if(this.wallets[id].publicKey == publicKey){
          return publicKey;
        }
      }

      return false;
    }
  }


}

let myWalletConnector = new WalletConnector();
myWalletConnector.createWallet('1234');

module.exports = WalletConnector
