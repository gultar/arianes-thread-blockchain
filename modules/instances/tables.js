let AccountTable = require('../classes/tables/accountTable')
let BalanceTable = require('../classes/tables/balanceTable')

module.exports = {
    accountTable:new AccountTable(),
    balance: new BalanceTable()
}