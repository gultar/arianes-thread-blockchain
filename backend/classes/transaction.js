///////////////Transaction//////////////////

const sha256 = require('../tools/sha256');
const crypto = require('crypto');
const fs = require('fs');
const jsonSize = require('json-size');

class Transaction{
  constructor(fromAddress, toAddress, amount, data='', hash='', type=''){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.data = data;
    this.timestamp = Date.now()
    this.hash = (hash? hash : sha256(this.fromAddress+ this.toAddress+ this.amount+ this.data+ this.timestamp));
    this.type = type;
    this.signature;
  }

  sign(callback){
    fs.exists('private.pem', (exists)=>{
      if(exists){
        try{

          var pem = fs.readFileSync('private.pem');
          var key = pem.toString('ascii');
          var sign = crypto.createSign('RSA-SHA256');
          sign.update(this.hash);  // data from your file would go here
          callback(sign.sign(key, 'hex'));

        }catch(err){
          console.log(err)
          return false;
        }

      }else{
        return false;
      }
    })

  }

  verify(publicKey){
    if(publicKey){
      try{

        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(this.hash);

        return verify.verify(publicKey, this.signature, 'hex');

      }catch(err){
        console.log(err);
        return false;
      }
    }else{
      console.log('Public key of sender is undefined');
      return false;
    }


  }

  static getTransactionSize(transaction){
    try{
      if(transaction){
        return jsonSize(transaction)
      }
    }catch(e){
      console.log(e)
    }
  }

  // static byteCount(transaction) {
  //   return encodeURI(transaction).split(/%..|./).length - 1;
  // }

}

module.exports = Transaction
