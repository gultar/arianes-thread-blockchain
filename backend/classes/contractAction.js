const Action = require('./action')

class ContractAction extends Action{
    constructor(fromAccount){
        super(fromAccount)
        this.fee = 0
        this.signature = fromAccount.signature
        this.type = "Contract Action"
    }

}

module.exports = ContractAction