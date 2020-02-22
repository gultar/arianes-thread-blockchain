let Mempool = require('./mempool/mempool')
let AccountTable = require('./tables/accountTable')
let BalanceTable = require('./tables/balanceTable')

module.exports = {
    mempool: new Mempool(),
    accountTable: new AccountTable(),
    balance: new BalanceTable()
}

