const genesis = require('../../tools/getGenesis')

class ProofOfWork{
    constructor({ difficulty, chain }){
        this.difficulty = difficulty
        this.chain = chain
    }

    validate(block){
        let difficultyIsAboveMinimum = BigInt(parseInt(block.difficulty, 16)) >= BigInt(parseInt(genesis.difficulty, 16))
        if(!difficultyIsAboveMinimum) return false
        let isValidChallenge = this.validateChallenge(block)
        if(!isValidChallenge) return false
        let isValidDifficulty = this.validateDifficulty(block)
        if(!isValidDifficulty) return false

        return true
    }

    validateDifficulty(block){
        let previousBlock = this.chain[block.blockNumber - 1]
        if(previousBlock){
          
          let difficultyRecalculated = this.difficulty.setNewDifficulty(previousBlock, block);
          let parsedRecalculatedDifficulty = BigInt(parseInt(difficultyRecalculated, 16))
          let parsedActualdifficulty = BigInt(parseInt(block.difficulty, 16))
          if(parsedActualdifficulty == parsedRecalculatedDifficulty){
            return true;
          }else{
            console.log('Difficulty recalculated: ', difficultyRecalculated)
            console.log('Block difficulty: ', block.difficulty)
            console.log('Previous Block', previousBlock)
            return false;
          }
        }
      }

    validateChallenge(block){
        let recalculatedChallenge = this.difficulty.setNewChallenge(block)
        let parsedRecalculatedChallenge = BigInt(parseInt(recalculatedChallenge, 16))
        let parsedActualChallenge = BigInt(parseInt(block.challenge, 16))
        if(parsedActualChallenge == parsedRecalculatedChallenge){
          return true
        }else{
          return false
        }
    }
}

module.exports = ProofOfWork