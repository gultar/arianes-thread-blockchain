
class Poll{
    constructor(init){
        let { contractAccount } = init
        this.contractAccount = contractAccount
        this.activePolls = {}
        this.state = {}
    }
}