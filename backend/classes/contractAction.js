const Action = require('./action')
const { isValidActionJSON } = require('../tools/jsonvalidator')

class ContractAction extends Action{
    constructor(fromAccount){
        super(fromAccount)
        this.fee = 0
        this.signature = fromAccount.signature
        this.type = "Contract Action"
        this.actionReference = {}
    }

    setReference(action){
        if(isValidActionJSON(action)){

            this.actionReference = {
                actionHash:action.hash,
                fromAccount:action.fromAccount,
                actionSignature:action.signature,
                actionTimestamp:action.timestamp
            }

        }else{
            return { error:'Invalid action format' }
        }
    }

}

module.exports = ContractAction