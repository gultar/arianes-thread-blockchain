const readline = require('readline');
const sha256 = require('./sha256');
const { logger, readFile } = require('./utils')
const { encrypt, decrypt, getPublicKey } = require('./keysHandler');
const Wallet = require('./wallet');
const ECDSA = require('ecdsa-secp256r1');

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

const tryOut = async () =>{
  let walletFile = await readFile('./wallets/8ab1b499f17855b0f1db5bd65a73875723325f85.json');
  let wallet = new Wallet()
  wallet.initFromJSON(JSON.parse(walletFile))
  
  let myWalletConnector = new WalletConnector();
  myWalletConnector.wallets[wallet.id] = wallet;
  let sign = myWalletConnector.wallets[wallet.id].privateKey.sign('hello');
  let pubKey = ECDSA.fromCompressedPublicKey(myWalletConnector.wallets[wallet.id].publicKey)
  console.log(pubKey.verify('hello', sign))


}

// tryOut()

module.exports = WalletConnector
