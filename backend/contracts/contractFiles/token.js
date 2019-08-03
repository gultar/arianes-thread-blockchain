const Wallet = require('Wallet')
const Account = require('Account')
const Action = require('Action')
const ContractAction = require('ContractAction')
const Permissions = require('Permissions')
const createContractInterface = require('createContractInterface')
const makeExternal = require('makeExternal')
const getFunctionArguments = require('getFunctionArguments')
const deploy = require('deploy')
const save = require('save')
const commit = require('commit')
const fail = require('fail')

class Token{
    constructor(init){
        let { contractAccount } = init
        this.name = 'Token'
        this.contractAccount = contractAccount
        this.state = { 
            tokens:{} 
        }
    }

    setState(state){
        this.state = state;
    }

    substract(amount){
        this.supply -= amount
    }

    createToken(params, account){
        let { symbol, name, maxSupply } = params
        if(!symbol) throw new Error('Symbol is required')
        if(!name) throw new Error('Token name is required')
        if(!maxSupply) throw new Error('Max token supply is required')
        if(!account) throw new Error('Creator account is required')

        if(this.state.tokens){
            if(!this.state.tokens[symbol]){

                this.state.tokens[symbol] = {
                    symbol:symbol,
                    name:name,
                    maxSupply:maxSupply,
                    creator:account,
                    supply:maxSupply,
                    history:{},
                    permissions: new Permissions(account),
                }
    
                return { success:`Token ${symbol} has been created with max supply of ${maxSupply}`}
    
            }else{
                throw new Error('Token already exists')
            }
        }else{
            console.log('Current State:',this.state)
            throw new Error('State is not properly set')
        }

    }

    async issue(issueParams){
        let { symbol, amount, issuerAccount, receiverAccount } = issueParams
        if(!symbol || !typeof symbol == 'string') throw new Error('Token symbol is required')
        if(!amount || !typeof symbol == 'number') throw new Error('Amount to issue is required')
        if(!issuerAccount) throw new Error('Creator account of token is required')
        if(!receiverAccount) throw new Error('Receiving account is required')

        let token = this.state.tokens[symbol]
        
        if(token && typeof token == 'object'){

            let hasSomePermission = token.permissions.accounts[issuerAccount]
            if(hasSomePermission){

                let isAllowed = hasSomePermission.level == token.permissions.level['owner']
                if(isAllowed){

                    if(issuerAccount == receiverAccount) throw new Error('Cannot issue coins to owner account')
                    
                    if(token.supply > amount){
                        
                        token.supply -= amount;
                        
                        let nonce = Object.keys(token.history).length + 1

                        this.substract(amount)

                        token.history[nonce] = {
                            actionType:'issue',
                            from:issuerAccount,
                            to:receiverAccount,
                            amount:amount,
                            timestamp:Date.now()
                        }

                        if(token.accountBalances){
                            let receiverBalance = token.accountBalances[receiverAccount]
                            
                            token.accountBalances[issuerAccount] = token.supply
                            token.accountBalances[receiverAccount] = receiverBalance + amount

                        }else{
                            token.accountBalances = {
                                [issuerAccount]:token.supply,
                                [receiverAccount]:amount
                            }
                        }
        
                        return { success:`Issued ${amount} CHARM tokens to account ${receiverAccount}` }
        
                    }else{
                        throw new Error('ERROR: Current coin supply does not allow for issuance of coins')
                    }
                
                }else{
                    throw new Error("Account" +issuerAccount+ "is not authorized to issue coins");
                }
            }else{
                throw new Error('Caller account does not have existing permissions')
            }

        }else{
            throw new Error(`Token ${symbol} does not exist`)
        }
        
     

    }

    getBalanceOfAccount(params, callingAccount){
        let { account, symbol } = params;
        let token = this.state.tokens[symbol]
        if(!token) throw new Error(`Token ${symbol} does not exist`)
        
        let balances = token.accountBalances
        if(!balances) throw new Error(`Account balances of token ${symbol} have not been set yet`)
        
        let accountBalance = balances[account]
        if(!accountBalance) throw new Error(`Could not find balance of account ${account}`)

        return accountBalance
    }

    async getInterface(){
        let external = makeExternal({
            name:this.name,
            contractAccount:this.contractAccount,
            createToken:{
                createToken:this.createToken,
                args:["symbol", "name", "maxSupply", "creator"]
            },
            issue:{
                issue:this.issue, 
                args:["symbol", "amount", "issuerAccount", "receiverAccount"],
            },
            getSupply:{
                getSupply:this.getSupply,
                args:["symbol"]
            },
            getBalanceOfAccount:{
                getBalanceOfAccount:this.getBalanceOfAccount,
                args:['account','symbol']
            }
        })
        let contractAPI = await createContractInterface(external)
        return contractAPI
    }

    getSupply(symbol){
        let token = this.state.tokens[symbol];
        if(token){
            return token.supply;
        }else{
            return { error:'Token does not exist' }
        }
    }
}