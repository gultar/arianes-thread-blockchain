const genesis = require('../../tools/getGenesis')
const { validatePublicKey } = require('../../tools/utils')
const ECDSA = require('ecdsa-secp256r1')

class Permissioned{
    constructor({ chain, accountTable }){
        this.chain = chain
        this.accountTable = accountTable
        this.validators = genesis.validators
        this.numberOfSignatures = genesis.numberOfSignatures
    }

    async validate(block){
        return await this.validateBlockSignatures(block)
    }

    async validateBlockSignatures(block){
        let isSignaturesObject = typeof block.signatures == 'object'
        if(!isSignaturesObject) return false

        let signatures = block.signatures;
        let publicKeys = Object.keys(signatures);
        let validated = false
        
        for await(let key of publicKeys){

            let isValidPublicKey = await validatePublicKey(key)
            if(!isValidPublicKey) return false

            if(!this.validators) this.validators[key] = true

            let isAuthorized = this.validators[key]
            if(!isAuthorized) return false
            else{
                let signature = signatures[key]
                const publicKey = await ECDSA.fromCompressedPublicKey(key);
                if(!publicKey) return false
                else{
                    validated = {}
                    validated[key] = await publicKey.verify(block.hash, signature)
                }
            }
        }

        return validated
    }

}

module.exports = Permissioned