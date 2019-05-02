///////////////Transaction//////////////////

const sha256 = require('../tools/sha256');
const crypto = require('crypto');
const fs = require('fs');
const jsonSize = require('json-size');

class Transaction{
  constructor(fromAddress, toAddress, amount, data='', hash='', type=''){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.data = data;
    this.timestamp = Date.now()
    this.hash = (hash? hash : sha256(this.fromAddress+ this.toAddress+ this.amount+ this.data+ this.timestamp));
    this.type = type;
    this.signature;
    this.miningFee = 0;
    this.amount = this.setMiningFee(amount);
  }

  setMiningFee(amount){
    let size = jsonSize(this);
    let sizeFee = size * 0.0001;
    this.miningFee = sizeFee  //Roughly a coin per kilobyte?
    return amount + sizeFee;
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
