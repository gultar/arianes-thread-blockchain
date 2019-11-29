const makeExternal = require('makeExternal')


class Voter{
    constructor(init){
        let { contractAccount } = init
        this.contractAccount = contractAccount
        this.hasVoted = false;
    }
}

class Proposal{
    constructor(){
        this.name = '';
        this.voteCount = 0;
    }
}

class Ballot{
    constructor(init){
        let { contractAccount } = init
        this.contractAccount = contractAccount
        this.proposals = []
        this.state = {
            ballots:{}
        }
    }

    setState(state){
        this.state = state;
    }
    
    createBallot(params, account){
        let { ballotId, name, description, voteLimit, authorizedVoters } = params

        if(typeof ballotId != 'string') throw new Error('Ballot Id parameter must be a string')
        if(typeof name != 'string') throw new Error('Name parameter must be a string')
        if(typeof description != 'string') throw new Error('Description parameter must be a string')
        //validate param arguments
        let ballotAlreadyExists = this.state.ballots[ballotId];
        if(!ballotAlreadyExists){

            this.state.ballots[ballotId] = {
                name:name,
                description:description,
                initiator:account,
                voteLimit:voteLimit,
                authorizedVoters:authorizedVoters || { [account.ownerKey]:account },
                proposals:{},
                votes:{},
                reward:{}  //To be determined, could be collected from tx call amounts
            }
    
            return { success:`Ballot ${ballotId} created with a limit of ${voteLimit} votes` }
        }else{
            throw new Error(`Ballot id ${ballotId} already exists`)
        }
    }

    closeBallot(params, callingAccount){
        return new Promise(async(resolve)=>{
            let { ballotId } = params;
            if(typeof ballotId != 'string') throw new Error('Ballot id parameter must be a string')

            let ballot = this.state.ballots[ballotId]
            if(ballot){
                let callingAccountIsInitiator = ballot.initiator.name == callingAccount.name;
                if(callingAccountIsInitiator){

                    let proposals = ballot.proposals;

                    let winner = {
                        votes:0
                    }
                    let numberOfVotes = []
                    for await(let key of Object.keys(proposals)){
                        let proposal = proposals[key];
                        numberOfVotes.push({
                            votes:proposal.votes,
                            name:proposal.name
                        })
                    }

                    for await(let proposal of numberOfVotes){
                        if(proposal.votes > winner.votes){
                            winner = proposal
                        }
                    }

                    this.state.ballots[ballotId] = {}
                    delete this.state.ballots[ballotId]

                    resolve({  winner:winner })
                    // return { winner:winner }

                }else{
                    throw new Error('Only the initiator of the ballot may close it and choose the winner')
                }
            }
        })
    }

    giveRightToVote(params, callingAccount){ //Only callable by initiator of ballot
        let { ballotId, account } = params;

        if(typeof ballotId != 'string') throw new Error('Ballot id parameter must be a string')
        if(typeof account != 'string') throw new Error('Account to authorize must be a string')

        let ballot = this.state.ballots[ballotId];
        if(ballot){
            let callingAccountIsInitiator = ballot.initiator.name == callingAccount.name;
            if(callingAccountIsInitiator){
                let isAlreadyAuthorized = ballot.authorizedVoters[account];
                if(!isAlreadyAuthorized){

                    ballot.authorizedVoters[account] = {
                        name: account,
                        timestamp:Date.now(),
                        givenRightBy:callingAccount.name
                    }
                    this.state.ballots[ballotId] = ballot;

                    return { allowed:`Account ${account} is authorized to cast a vote` }

                }else{
                    throw new Error(`Account ${account} is already authorized to vote on ballot ${ballotId}`)
                }
            }else{
                throw new Error('Only the initiator of the ballot may give accounts the right to vote')
            }
        }else{
            throw new Error(`Ballot id ${ballotId} does not exist`)
        }
    }  

    vote(params, account){
        let { ballotId, votingFor } = params;

        if(typeof ballotId != 'string') throw new Error('Ballot id parameter must be a string')
        if(typeof votingFor != 'string') throw new Error('Name of account to vote for must be a string')

        let ballot = this.state.ballots[ballotId];
        if(ballot){

            let hasRightToVote = ballot.authorizedVoters[account.name]
            if(hasRightToVote){
                let hasVoted = ballot.votes[account.ownerKey];
                if(!hasVoted){

                    let existingProposal = ballot.proposals[votingFor];
                    if(existingProposal){

                        existingProposal.votes++;
    
                        ballot.votes[account.ownerKey] = {
                            votingFor:votingFor,
                            timestamp:Date.now()
                        }

                        this.state.ballots[ballotId] = ballot;
    
                        return { voted:`Casted a vote successfully! ${votingFor} now has ${existingProposal.votes}` }
                    }else{
                            //New proposal
                            ballot.proposals[votingFor] = {
                                name:votingFor,
                                votes:1
                            }

                            ballot.votes[account.ownerKey] = {
                                votingFor:votingFor,
                                timestamp:Date.now()
                            }

                            this.state.ballots[ballotId] = ballot;
    
                            return { voted:`Submitted a new proposal! Accounts may now vote for ${votingFor}` }
                    }
    
                }else{
                    throw new Error(`Account ${account.name} has already voted`)
                }
            }else{
                throw new Error(`Account ${account.name} is not authorized to vote`)
            }
        }else{
            throw new Error(`Ballot ID ${ballotId} is undefined`)
        }
    }

    getBallotState(params, callingAccount){
        let { ballotId } = params;
        if(!ballotId) throw new Error('Must provide ballot id to fetch')

        let ballot = this.state.ballots[ballotId];
        if(ballot){
            return ballot
        }else{
            return { [ballotId]:'Unkown ballot id' }
        }
    }

    async getInterface(){
        let external = makeExternal({
            createBallot:{
                type:'set',
                args:["ballotId","name","description","voteLimit","authorizedVoters"],
                description:'Starts a ballot'
            },
            closeBallot:{
                type:'set',
                private:'Initiator only',
                args:["ballotId"],
                description:'Initiator closes the ballot and picks a winner'
            },
            giveRightToVote:{
                type:'set',
                private:'Initiator only',
                args:["ballotId","account"],
                description:'Initiator of the ballot allows another account to vote'
            },
            vote:{
                type:'set',
                authorized:'Accounts which are authorized can vote',
                args:["ballotId","name"],
                description:'Vote for an account or submit a new proposal'
            },
            getBallotState:{
                type:'get',
                args:['id'],
                description:`Returns the current state of the ballot`
            }
        })

        return external
    }

}
