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
        return new Promise((resolve)=>{
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

                        this.state.tokens[symbol].history[nonce] = {
                            actionType:'issue',
                            from:issuerAccount,
                            to:receiverAccount,
                            amount:amount,
                            timestamp:Date.now()
                        }

                        if(token.accountBalances){
                            let receiverBalance = this.state.tokens[symbol].accountBalances[receiverAccount]
                            
                            this.state.tokens[symbol].accountBalances[issuerAccount] = token.supply
                            this.state.tokens[symbol].accountBalances[receiverAccount] = receiverBalance + amount

                        }else{
                            this.state.tokens[symbol].accountBalances = {
                                [issuerAccount]:token.supply,
                                [receiverAccount]:amount
                            }
                        }
        
                        resolve({ success:`Issued ${amount} ${symbol} tokens to account ${receiverAccount}` })
        
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
        })
    }

    transfer(transferParams){
        return new Promise((resolve)=>{
            let { symbol, amount, senderAccount, receiverAccount } = transferParams
            if(!symbol || !typeof symbol == 'string') throw new Error('Token symbol is required')
            if(!amount || !typeof symbol == 'number') throw new Error('Amount to issue is required')
            if(!senderAccount) throw new Error('Sender account is required')
            if(!receiverAccount) throw new Error('Receiving account is required')

            let token = this.state.tokens[symbol]

            if(token){

                let senderBalance = this.getBalanceOfAccount({
                    senderAccount:senderAccount,
                    symbol:symbol
                })
                let hasEnoughFunds = senderBalance >= amount

                if(hasEnoughFunds){

                    if(senderAccount == receiverAccount) throw new Error('Cannot transfer coins to the same account')
                
                        let nonce = Object.keys(token.history).length + 1

                        token.history[nonce] = {
                            actionType:'transfer',
                            from:senderAccount,
                            to:receiverAccount,
                            amount:amount,
                            timestamp:Date.now()
                        }

                        if(!token.accountBalances) throw new Error('Account balances have not yet been set. Token must have been issued first')
                        let receiverBalance = token.accountBalances[receiverAccount]
                            
                        token.accountBalances[senderAccount] = senderBalance - amount
                        token.accountBalances[receiverAccount] = receiverBalance + amount

                        resolve({ success:`Account ${senderAccount} transfered ${amount} ${symbol} tokens to account ${receiverAccount}` })
                
                }else{
                    throw new Error("Account" +senderAccount+ "is not authorized to issue coins");
                }

            }else{
                throw new Error(`Token ${symbol} does not exist`)
            }
    
        })
    }

    getBalanceOfAccount(params){
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
            createToken:{
                createToken:this.createToken,
                args:["symbol", "name", "maxSupply", "creator"],
                description:'Creates a token that is exchangeable through actions'
            },
            issue:{
                issue:this.issue, 
                args:["symbol", "amount", "issuerAccount", "receiverAccount"],
                description:'Creator of token may issue tokens to another account'
            },
            transfer:{
                transfer:this.transfer,
                args:["symbol", "amount", "senderAccount", "receiverAccount"],
                description:'An account holding tokens may transfer to another account'
            },
            readOnly:{
                getBalanceOfAccount:{
                    getBalanceOfAccount:this.getBalanceOfAccount,
                    args:['account','symbol'],
                    description:`Get an account's balance of a given token`
                }
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