// const Contract = require('./authentication');
// const { extendContract } = require('../toolbox/contractTools')
// let _ = require('private-parts').createKey();
// const authenticateAccount = require('./authentication');
// const Account = require('../../classes/account');
// const Wallet = require('../../classes/wallet');
// const { logger } = require('../../tools/utils');
// const Transaction = require('../../classes/transaction')
// const Action = require('../../classes/transaction')


// class Sandbox{
//     constructor(){
//         this.tools = {};
//         this.classes = {};
//     }

//     exposeClasses(){
//         return({
//             Wallet:Wallet,
//             extendContract:extendContract,
//             Account:Account,
//             Transaction:Transaction,
//             logger:logger,
//             Action:Action,
//             authenticateAccount:authenticateAccount
            
            
//         })
//     }
// }

// module.exports = {
//     "Wallet":Wallet,
//     "extendContract":extendContract,
//     "Account":Account,
//     "Transaction":Transaction,
//     "logger":logger,
//     "Action":Action,
//     "authenticateAccount":authenticateAccount,
//     "console":{
//         log:function(...args){
//             console.log(...args)
//         }
//     }
    
// }