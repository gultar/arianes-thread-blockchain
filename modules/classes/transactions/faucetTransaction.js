const Transaction = require('./transaction')
const sha256 = require('../../tools/sha256')

class FaucetTransaction extends Transaction{
    constructor(params){
        
        super(params)
        this.fromAddress = "faucet"
        this.type = 'faucet'
        this.miningFee = 0
        this.hash = sha256(this.fromAddress+ 
            this.toAddress+ 
            this.amount.toString()+ 
            (typeof this.data == 'string' ? this.data : JSON.stringify(this.data))
            + this.timestamp.toString()
            + this.nonce.toString());
    }

}


module.exports = FaucetTransaction

