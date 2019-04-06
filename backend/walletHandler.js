const readline = require('readline');
const sha256 = require('./sha256');
const { encrypt, decrypt, getPublicKey } = require('./keysHandler')

class Wallet{
  /**
    @param {String} Passphrase: for encrypting privatekey for storage
  */
  constructor(){
    this._publicKey = '';
    this._id = '';
  }


  get publicKey(){
    return this._publicKey;
  }

  set publicKey(key){
    this._publicKey = key;
  }

  async initWalletID(callback){

      this._publicKey = await getPublicKey();
      if(this._publicKey){
        this._id = sha256(this._publicKey);
        callback(this._id);
      }else{
        console.log('ERROR: Could not init wallet id')
      }

  }


}

module.exports = Wallet
