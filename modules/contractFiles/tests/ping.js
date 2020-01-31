let getContract = require('getContract')
let makeExternal = require('makeExternal')

class Ping{
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
        
        let Pong = await getContract({
            contractName:'Pong',
            hash:params.callingAction.hash
        })
        if(Pong.error) console.log('Pong error:', Pong.error)
        else{
            console.log('Pong...')
        
            let pong = new Pong({
                contractAccount:{
                    name:'Pong'
                }
            })

            return pong.send(params)
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