const Transaction = require('./transaction')
const sha256 = require('../../tools/sha256')

class Payable extends Transaction{
    constructor(params){
        super(params)
        let { reference, fromContract, delayToBlock } = params
        if(!params.reference) throw new Error('ERROR: Need to provide reference for contract transaction')
        this.type = 'payable'
        this.fromContract = fromContract;
        this.miningFee = 0
        this.reference = params.reference;
        this.signature = reference.signature;
        this.delayToBlock = delayToBlock;
        this.hash = sha256(this.fromAddress+ 
            this.toAddress+ 
            this.amount.toString()+ 
            (typeof this.data == 'string' ? this.data : JSON.stringify(this.data))
            + this.timestamp.toString()
            + this.nonce.toString());
    }

}

module.exports = Payable