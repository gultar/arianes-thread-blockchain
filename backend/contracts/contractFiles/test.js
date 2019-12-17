const makeExternal = require('makeExternal')
class FuckUp{
    constructor(fuck){
        this.counter = 0
        this.fuck = fuck
        this.state = {
            fuck:"up"
        }
    }

    setState(state){
        this.state = state
    }

    fuckup(){
        let counter
        while(true){
            counter++
        }
    }

    boom(){
        let text = `oajwdoiajwdoijawdoiajwdoiajdoiajwdoiawjdoiawjdoaiwjdoiawjdoaiwjdoawijdoawijdoiawj`
        let explosion = text + text + text + text + text + text + text
        let nuclear = explosion + explosion + explosion + explosion + explosion + explosion
        let kaboom = ''
        while(true){
            kaboom = nuclear + nuclear + nuclear + nuclear + nuclear
        }
    }

    test(){
        
    }

    getInterface(){
        let api = makeExternal({
            fuckup:{
                type:'set',
                args:[],
                description:'Fucks up real bad'
            },
            boom:{
                type:'set',
                args:[],
                description:'Boom chika chika boom boom'
            },
            test:{
                type:'set',
                args:[],
                description:'test'
            },
        })

        return api
    }
}
