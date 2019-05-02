const WalletManager = require('./walletManager')

class Account{
    constructor(name, ownerKey, signature){
        this.name = name;
        this.ownerKey = ownerKey;
        this.ownerSignature = signature
    }

    emitContract(pathToFile){
        if(pathToFile){
            //create transaction and send to node
        }
    }

}

module.exports = Account;