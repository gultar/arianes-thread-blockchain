let getContract = require('getContract')
let makeExternal = require('makeExternal')

class Pong{
    constructor({ contractAccount }){
        this.contractAccount = contractAccount
        this.state = {
            "empty":"empty"
        }
    }

    setState(state){
        this.state = state
    }

    async send(params){
        
        let Ping = await getContract({
            contractName:'Ping',
            hash:params.callingAction.hash
        })
        if(Ping.error) console.log('Ping error:', Ping.error)
        else{
            console.log('Ping...')
        
            let ping = new Ping({
                contractAccount:{
                    name:'Ping'
                }
            })

            return ping.send(params)
        }
        
    }

    getInterface(){
        let api = makeExternal({
            send:{
                type:'set',
                args:[],
                description:'Send calls back and forth'
            },
        })

        return api
    }

}