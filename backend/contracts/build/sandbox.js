const Contract = require('../toolbox/contract')
const Coin = require('../toolbox/coin')

class Sandbox{
    constructor(){
        this.tools = {};
        this.classes = {};
    }

    exposeCoin(){
        return Coin;
    }

    exposeClasses(){
        return({
            Coin:Coin,
            Contract:Contract
        })
    }
}

module.exports = Sandbox