const genesis = require('../../tools/getGenesis')
const { validatePublicKey } = require('../../tools/utils')
const ECDSA = require('ecdsa-secp256r1')

class Permissioned{
    constructor({ chain, accountTable }){
        this.chain = chain
        this.accountTable = accountTable
        this.validators = genesis.validators
        this.numberOfSignatures = genesis.minimumSignatures || 1
    }

    async validate(block){
        return await this.validateBlockSignatures(block)
    }

    async validateBlockSignatures(block){
        let isSignaturesObject = typeof block.signatures == 'object'
        if(!isSignaturesObject) return { error:'ERROR: Block signatures are not of an invalid format' }

        let signatures = block.signatures;
        let publicKeys = Object.keys(signatures);
        if(publicKeys.length < this.numberOfSignatures) return { error:'ERROR: Number of block signatures is insufficient' }
        let validated = false
        
        for await(let key of publicKeys){

            let isValidPublicKey = await validatePublicKey(key)
            if(!isValidPublicKey) return { error:'ERROR: Public key is not a valid public key' }

            if(!this.validators) this.validators[key] = true

            let isAuthorized = this.validators[key]
            if(!isAuthorized) return { error:`ERROR: Public key ${key.substr(0, 10)}... is not authorized` }
            else{
                let signature = signatures[key]
                const publicKey = await ECDSA.fromCompressedPublicKey(key);
                if(!publicKey) return { error:'ERROR: Public key provided is not a valid compressed public key' }
                else{
                    validated = {}
                    validated[key] = await publicKey.verify(block.hash, signature)
                    if(validated[key] === false) return { error:`ERROR: Key ${key.substr(0,10)}... signature is invalid` }
                }
            }
        }

        return validated
    }

}

module.exports = Permissioned