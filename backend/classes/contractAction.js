const Action = require('./action')
const sha256 = require('../tools/sha256');

const { isValidCallPayloadJSON } = require('../tools/jsonvalidator')

class ContractAction extends Action{
    constructor({ fromAccount, data, task, actionReference, delayToBlock }){
        // if(!isValidCallPayloadJSON(actionReference)) throw new Error('Invalid action reference structure')
        super(fromAccount)
        this.fromAccount = fromAccount
        this.data = {
            contractName:data.contractName,
            method:data.method,
            params:data.params,
            cpuTime:data.cpuTime
        }
        this.fee = 0
        this.signature = actionReference.signature
        this.type = "contract action"
        this.actionReference = { [actionReference.hash]:actionReference } || {}
        this.task = task
        this.delayToBlock = delayToBlock || 0  //Either to blockNumber or to timestamp
        this.hash = this.calculateActionHash();
    }

    calculateActionHash(){
        return sha256(this.fromAccount + this.type + this.task + this.data + this.fee + this.timestamp)
     }

    // setReference(action){
    //     if(isValidActionJSON(action)){

    //         this.actionReference = {
    //             actionHash:action.hash,
    //             fromAccount:action.fromAccount,
    //             actionSignature:action.signature,
    //             actionTimestamp:action.timestamp
    //         }

    //     }else{
    //         return { error:'Invalid action format' }
    //     }
    // }

}

module.exports = ContractAction