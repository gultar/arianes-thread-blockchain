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
    this.miningFee = 0
  }

  setMiningFee(){
    let size = jsonSize(this);
    let sizeFee = size * 0.0001;  //Roughly a coin per kilobyte?
    console.log('size ', size)
    console.log('size fee', this.amount+sizeFee)
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
