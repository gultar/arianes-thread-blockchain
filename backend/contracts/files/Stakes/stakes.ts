const makeExternal = require('makeExternal')
const getContract = require('getContract')
const getState = require('getState')
const getAccount = require('getAccount')

interface Vault{
    contractAccount: string,
    state: VaultState,
}

interface StakeParams{
    symbol: string,
    amount: number,
    retrievableBy: null | Array<string>,
    callingAction: Action
}

interface RetrieveParams{
    ofAccount: string,
    hash: string,
    amount: number,
    callingAction: Action
}

interface Stake{
    fromAccount:string,
    symbol: string,
    amount: number,
    retrievableBy: null | Array<string>,
    stakingAction?: Action,
}

interface Account{
    [key: string] : any
}

interface ActionPayload{
    method:string,
    cpuTime: number,
    params: object,
    contractName: string
}

interface Action{ 
    fromAccount: string, 
    type: string, 
    task: string, 
    data: ActionPayload,
    hash: string
}

interface VaultState{
    stakes:{
        [accountName: string]: {
            [hash: string]: Stake,
            
        }
    }
}

class Stake{
    constructor({ fromAccount, symbol, amount, retrievableBy, stakingAction }){
        this.fromAccount = fromAccount
        this.symbol = symbol
        this.amount = amount
        this.retrievableBy = retrievableBy
        this.stakingAction = stakingAction
    }
}


class Vault{
    constructor(initParams){
        this.contractAccount = initParams.contractAccount
        this.state = {
            stakes:{}
        }
    }

    async stakeAmount(params: StakeParams, callingAccount: Account){
        
        let { symbol, amount, retrievableBy, callingAction } = params;
        
        let hash = callingAction.hash
        if(!symbol) throw new Error('ERROR: Symbol of currency to stake is required')
        if(!amount || typeof amount !== 'number') throw new Error('ERROR: Amount to stake needs to be a numerical value')
        
        let accountName = callingAccount.name

        if(!retrievableBy){
            retrievableBy = [accountName]
        }

        let accountVault = this.state.stakes[accountName];
        
        if(!accountVault){
            accountVault = {}
            accountVault[hash] = new Stake({
                fromAccount:accountName,
                symbol: symbol,
                amount: amount,
                retrievableBy: retrievableBy,
                stakingAction: callingAction
            })
            
        }else{
            let alreadyExists = accountVault[hash]
            if(!alreadyExists){
               
                this.state.stakes[accountName][hash] = new Stake({
                    fromAccount:accountName,
                    symbol: symbol,
                    amount: amount,
                    retrievableBy: retrievableBy,
                    stakingAction: callingAction
                })
            }else{
                throw new Error(`ERROR: Stake hash ${hash.substr(0, 10)}... already exists`)
            }
        }

        return {
            success:`${accountName} has staked ${amount} ${symbol}. It may be retrieved by ${(Array.isArray(retrievableBy) ? JSON.stringify(retrievableBy) : retrievableBy)}`
        }
        

    }

    async retrieveAmount(params: RetrieveParams, callingAccount: Account){
        let { ofAccount, hash, amount, callingAction } = params;

        if(!ofAccount) throw new Error('ERROR: Need name of staking account to retrieve stake')
        if(!hash) throw new Error('ERROR: Need hash of action that created stake')
        if(!amount) throw new Error('ERROR: Need amount to retrieve')

        let vaultExists = this.state.stakes[ofAccount];
        if(!vaultExists) throw new Error(`ERROR: Account ${ofAccount} does not have any stakes`)

        let stake = this.state.stakes[ofAccount][hash]
        if(!stake) throw new Error(`ERROR: Stake ${hash.substr(0, 10)}... does not exist`)

        let isAuthorized = stake.retrievableBy.includes(callingAccount.name)
        if(!isAuthorized) throw new Error(`ERROR: Account ${callingAccount.name} is not authorized to retrieve stake`)

        
    }

    setState(){}

    getInterface(){
        let api = makeExternal({
            stakeAmount: {
                type: 'set',
                args: [
                    "symbol: number",
                    "amount: string",
                    "startingPrice: number",
                    "timeLimit: Date"
                ],
                description: 'Create a new auction'
            },
            retrieveAmount:{
                type:'set',
                args:[
                    "id: string",
                ],
                description:"Close an auction and select a winner. May only be invoked by the auction's creator"
            },
            getStakesOfAccount: {
                type: 'set',
                args: ['id: string', 'price: number'],
                description: 'Place a bid on a given auction'
            },
        });
        return api;
    }
}