const Database = require('./database')


class Stakes{
    constructor(){
        this.stakes = new Database('../data/')
        this.stakingAccounts = {}
    }

    stakeCoins({amount, publicKey}){

    }

    removeStake({amount, publicKey}){
        
    }

}