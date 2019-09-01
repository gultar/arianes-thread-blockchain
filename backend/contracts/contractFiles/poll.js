
class Poll{
    constructor(init){
        let { contractAccount } = init
        this.contractAccount = contractAccount
        this.activePolls = {}
        this.state = {}
    }

    createPoll(params){
        let { name, description, question, options, duration, } = params
        //validate param arguments

        //set activePolls entry
        //set node timer
        //create poll options interface
        //create poll account memory
        //create poll statistics
    }
}