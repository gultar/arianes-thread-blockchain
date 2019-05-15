///////////////Transaction//////////////////

const sha256 = require('../tools/sha256');
const crypto = require('crypto');
const fs = require('fs');
const jsonSize = require('json-size');

class Transaction{
  constructor(fromAddress, toAddress, amount, data='', type='', hash='', ){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.type = type;
    this.data = data;
    this.timestamp = Date.now()
    this.miningFee = 0;
    this.amount = this.setMiningFee(amount);
    this.signature;
    this.hash = (hash? hash : sha256(this.fromAddress+ this.toAddress+ this.amount+ this.data+ this.timestamp));
  }

  setMiningFee(amount){
    let txToWeigh = {
      fromAddress:this.fromAddress,
      toAddress:this.toAddress,
      type:this.type,
      data:this.data,
      timestamp:this.timestamp
    }
    let size = jsonSize(txToWeigh);
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
