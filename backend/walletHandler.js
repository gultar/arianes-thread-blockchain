const readline = require('readline');
const sha256 = require('./sha256');
const { encrypt, decrypt, getPublicKey } = require('./keysHandler')

class WalletConnector{
  constructor(){
    this.wallets = {};
    this.connectors = {};
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

module.exports = WalletConnector
