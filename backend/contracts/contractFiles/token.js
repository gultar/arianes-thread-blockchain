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
    
                return { success:`Token ${name} has been created with max supply of ${maxSupply}`}
    
            }else{
                throw new Error('Token already exists')
            }
        }else{
            console.log('Current State:',this.state)
            throw new Error('State is not properly set')
        }

    }

    async issue(issueParams){
        let { symbol, amount, issuerAccount, receivingAccount } = issueParams
        if(!symbol || !typeof symbol == 'string') throw new Error('Token symbol is required')
        if(!amount || !typeof symbol == 'number') throw new Error('Amount to issue is required')
        if(!issuerAccount) throw new Error('Creator account of token is required')
        if(!receivingAccount) throw new Error('Receiving account is required')

        let token = this.state.tokens[symbol]
        
        if(token && typeof token == 'object'){
            let permissionedAccount = token.permissions.accounts[issuerAccount.name]
            if(permissionedAccount){
                let isAllowed = permissionedAccount.level == token.permissions.level['owner'] //hasPermission(issuerAccount.name, 'owner')
            
                if(isAllowed){
                    
                    if(token.supply > amount){
                        
                        token.supply -= amount;
        
                        let issueAction = new ContractAction({
                            name:this.contractAccount.name,
                            publicKey:this.contractAccount.ownerKey
                        })
                        
                        let nonce = Object.keys(token.history).length + 1

                        
                        
                        //Need to create a balance table for this contract and for each currency
                        issueAction.defineTask({
                            contractName:"Token",
                            method:"issue",
                            params:{
                                amount:amount,
                                toAccount:receivingAccount
                            }
                        })

                        issueAction.setReference(issueParams.action)
                        
                        this.substract(amount)

                        token.history[nonce] = {
                            from:issuerAccount,
                            to:receivingAccount,
                            timestamp:Date.now()
                        }
        
                        return issueAction
        
                    }else{
                        throw new Error('ERROR: Current coin supply does not allow for issuance of coins')
                    }
                
                }else{
                    throw new Error("Account" +issuerAccount.name+ "is not authorized to issue coins");
                }
            }else{
                throw new Error('Caller account does not have existing permissions')
            }

        }else{
            throw new Error(`Token ${symbol} does not exist`)
        }
        
     

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
                args:["symbol", "amount", "issuerAccount", "receivingAccount"],
            },
            getSupply:{
                getSupply:this.getSupply,
                args:["symbol"]
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