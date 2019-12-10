/**
 TFLB | Thousandfold Blockchain
 @author: Sacha-Olivier Dulac
*/

const sha256 = require('../tools/sha256');
const sha1 = require('sha1')
const crypto = require('crypto');
const fs = require('fs');
const jsonSize = require('json-size');

class Transaction{
  constructor(fromAddress, toAddress, amount, data='', type='', hash='', miningFee=false, nonce=0){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.type = type;
    this.data = data;
    this.timestamp = Date.now()
    this.amount = amount
    this.signature;
    this.nonce = nonce
    this.hash = (hash? hash : sha256(this.fromAddress+ this.toAddress+ this.amount+ this.data+ this.timestamp+ this.nonce));
    this.miningFee = (miningFee ? miningFee : this.setMiningFee())
    
    
  }

  setMiningFee(){
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
    return sizeFee;
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

}

module.exports = Transaction
