
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

    getInterface(){
        return {
            fuckup:{"type":"function","name":"fuckup"}
        }
    }
}