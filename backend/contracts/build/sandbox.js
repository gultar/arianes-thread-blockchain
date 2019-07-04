const Contract = require('./authentication');
const serializeActiveObjects = require('../toolbox/contractTools')
let _ = require('private-parts').createKey();
const authenticateAccount = require('./authentication');
const Account = require('../../classes/account');
const Wallet = require('../../classes/wallet');
const { logger } = require('../../tools/utils');
const Transaction = require('../../classes/transaction')
const Action = require('../../classes/transaction')


class Sandbox{
    constructor(){
        this.tools = {};
        this.classes = {};
    }

    exposeClasses(){
        return({
            Contract:Contract,
            serialize:serializeActiveObjects,
            Account:Account,
            Transaction:Transaction,
        })
    }
}

module.exports = Sandbox