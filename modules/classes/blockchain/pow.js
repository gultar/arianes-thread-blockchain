const genesis = require('../../tools/getGenesis')

class ProofOfWork{
    constructor({ difficulty, chain, getBlock }){
        this.difficulty = difficulty
        this.getBlock = getBlock
        this.chain = chain
    }

    async validate(block){
        let difficultyIsAboveMinimum = BigInt(parseInt(block.difficulty, 16)) >= BigInt(parseInt(genesis.difficulty, 16))
        if(!difficultyIsAboveMinimum) return false
        let isValidChallenge = this.validateChallenge(block)
        if(!isValidChallenge) return false

        return true
    }

    //Does not work. Does not always get the right blockNumber
    // async validateDifficulty(block){
    //     let previousBlock = await this.getBlock(block.blockNumber - 1)//this.chain[block.blockNumber - 1]
    //     if(previousBlock){
          
    //       let difficultyRecalculated = this.difficulty.setNewDifficulty(previousBlock, block);
    //       let parsedRecalculatedDifficulty = BigInt(parseInt(difficultyRecalculated, 16))
    //       let parsedActualdifficulty = BigInt(parseInt(block.difficulty, 16))
          
    //       if(parsedActualdifficulty == parsedRecalculatedDifficulty){
    //         return true;
    //       }else{
    //         console.log('This block', block.blockNumber)
    //         console.log('Difficulty recalculated: ', difficultyRecalculated)
    //         console.log('Block difficulty: ', block.difficulty)
    //         console.log('Previous Block', previousBlock.blockNumber)
    //         console.log('Previous difficulty', previousBlock.difficulty)
    //         return false;
    //       }
    //     }
    //   }

    validateChallenge(block){
        let recalculatedChallenge = this.difficulty.setNewChallenge(block)
        let parsedRecalculatedChallenge = BigInt(parseInt(recalculatedChallenge, 16))
        let parsedActualChallenge = BigInt(parseInt(block.challenge, 16))
        var hashIsBelowChallenge = BigInt(parseInt(block.hash, 16)) <= BigInt(parseInt(block.challenge, 16))
        if(parsedActualChallenge == parsedRecalculatedChallenge && hashIsBelowChallenge){
          return true
        }else{
          return false
        }
    }
}

module.exports = ProofOfWork