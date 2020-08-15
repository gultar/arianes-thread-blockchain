
let reputationScoreChart = {
    1000:"great",
    750:"good",
    500:"mediocre",
    250:"bad",
    1:"untrusted"
}
let maxScore = 2000
class PeerReputation{
    constructor(address, reputation="good", score=750){
        this.address = address
        this.reputation = reputation //great, good, mediocre, bad
        this.score = score  // on 1000
        
    }

    adjustReputation(score){
        if(score >= 1000) return 'great'
        else if(score < 1000 && score >= 750) return 'good'
        else if(score < 750 && score >= 500) return 'mediocre'
        else if(score < 500 && score >= 250) return 'bad'
        else if(score < 250 && score >= 1) return 'very bad'
        else if(score < 1) return 'untrusted'
    }

    async decreaseScore(amount){
        if(amount && typeof amount == 'number' && amount > 0){
            this.score = this.score - amount
            if(this.score < 0) {
                this.score = 0
            }
            
            this.reputation = this.adjustReputation(this.score)
            console.log('New rep:', this.reputation)
            return this.reputation
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