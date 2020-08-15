
let reputationScoreChart = {
    1000:"great",
    750:"good",
    500:"mediocre",
    250:"bad",
    1:"untrusted"
}
let maxScore = 2000
class PeerReputation{
    constructor(address, reputation="great", score=750){
        this.address = address
        this.reputation = reputation //great, good, mediocre, bad
        this.score = score  // on 1000
        
    }

    async adjustReputation(){
        let margins = Object.keys(reputationScoreChart)
        for await(let margin of margins){
            if(this.score >= margin){
                this.reputation = reputationScoreChart[margin]
            }
        }
        return { adjusted:this.reputation }
    }

    async decreaseScore(amount){
        if(amount && typeof amount == 'number' && amount > 0){
            this.score -= amount
            if(this.score < 0) this.score = 0
            return await this.adjustReputation()
        }else{
            return { error:'ERROR: Could not decrease score. Amount must be positive integer' }
        }
    }

    async increaseScore(amount){
        if(amount && typeof amount == 'number' && amount > 0){
            this.score += amount
            if(this.score > maxScore) this.score = maxScore
            await this.adjustReputation()
        }else{
            return { error:'ERROR: Could not increase score. Amount must be positive integer' }
        }
    }

}

module.exports = PeerReputation