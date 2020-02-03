

class Consensus{
    constructor(options){
        this.options = options
        let { consensusMode, chain, path } = options
        this.chain = chain
        this.consensusMode = consensusMode
        this.engine = {}
        this.path = path || {
            'Proof of Work':'./pow',
            'Permissioned':'./permissioned'
        }
    }

    async validate(block){
        let ProofClass = require(this.path[this.consensusMode])
        let proof = new ProofClass(this.options)
        return await proof.validate(block)
    }
   
}


module.exports = Consensus