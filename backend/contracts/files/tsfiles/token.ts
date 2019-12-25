const makeExternal = require('makeExternal')
let Permissions = require('Permissions')

interface Account { name: string, ownerKey: string, [key: string]: any }

interface InitParams { contractAccount: Account, [key: string] : any }

interface Tokens{
    name: string,
    contractAccount: Account,
    state: TokenState,

}

interface TokenState{
    tokens:{
        [key: string] : Token
    }
}

interface Permission{}

interface Token{
    symbol:string,
    name:string,
    maxSupply:number,
    creator:string,
    supply:number,
    permissions: Permission,
}

interface SmartContract{ state: object, [key:string]: any, setState(state: TokenState):void, getInterface():void }

interface CreateTokensParams{
    symbol:string,
    name:string,
    maxSupply:number
}

class Token{
    constructor(params: Token){
        let {  symbol, name, maxSupply, creator, permissions } = params;
        this.symbol = symbol;
        this.name = name;
        this.maxSupply = maxSupply;
        this.creator = creator;
        this.supply = maxSupply;
        this.permissions = permissions;
    }
}

class Tokens implements SmartContract{
    constructor(init: InitParams){
        let { contractAccount } = init; 
        this.name = 'Token';
        this.contractAccount = contractAccount;
    }

    setState(state: TokenState): void{
        this.state = state;
    }

    createToken(params: CreateTokensParams, account: Account){
        let { symbol, name, maxSupply } = params
        if(!symbol) throw new Error('Symbol is required')
        if(!name) throw new Error('Token name is required')
        if(!maxSupply || maxSupply <= 0) throw new Error('Max token supply greater than 0 is required')
        if(!account) throw new Error('Creator account is required')

        if(typeof maxSupply == 'string'){
            throw new Error('Invalid max supply value')
        }

        let creator = account.name;

        if(this.state.tokens){
            if(!this.state.tokens[symbol]){
                
                this.state.tokens[symbol] = new Token({
                    symbol:symbol,
                    name:name,
                    maxSupply:maxSupply,
                    creator:creator,
                    supply:maxSupply,
                    permissions: new Permissions(account),
                })
    
                return { success:`Token ${symbol} has been created with max supply of ${maxSupply}`}
    
            }else{
                throw new Error('Token already exists')
            }
        }else{
            throw new Error('State is not properly set')
        }

    }

    async getInterface(){
        let external = makeExternal({
            createToken:{
                type:'set',
                args:["symbol", "name", "maxSupply"],
                description:'Creates a token that is exchangeable through actions'
            },
            issue:{
                type:'set',
                args:["symbol", "amount", "receiver"],
                description:'Creator of token may issue tokens to another account'
            },
            transfer:{
                type:'set',
                args:["symbol", "amount", "receiver"],
                description:'An account holding tokens may transfer to another account'
            },
            getBalanceOfAccount:{
                type:'get',
                args:['account','symbol'],
                description:`Get an account's balance of a given token`
            }
        })
        
        return external
    }



}