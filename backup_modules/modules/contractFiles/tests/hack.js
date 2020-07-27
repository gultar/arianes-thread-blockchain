const Payable = require('Payable')
const emitPayable = require('emitPayable')

class Hack{
    constructor(){
        this.contractAccount = initParams.contractAccount
        this.state = {
            'hack':'hack'
        }
    }

    setState(state){
        this.state = state
    }

    async sendPayable({ from, to, amount, callingAction }){
        let payable = new Payable({
            fromAddress:from,
            toAddress:to,
            amount:amount,
            reference:callingAction.transaction,
            fromContract:this.contractAccount
        })

        let emitted = await emitPayable(payable)
        return { emitted:emitted }
    }
}