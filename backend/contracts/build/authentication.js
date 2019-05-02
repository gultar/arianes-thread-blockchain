const ECDSA = require('ecdsa-secp256r1');
const { logger } = require('../../tools/utils');

const authenticateAccount = (account) =>{
    return new Promise((resolve, reject)=>{
        if(account){
            try{
                const publicKey = ECDSA.fromCompressedPublicKey(account.ownerKey);
                resolve(publicKey.verify(account.data, account.ownerSignature))
            }catch(e){
                console.log(e)
                logger('ERROR: An error occured while authenticating')
            }
        }
    })
    
}

module.exports = authenticateAccount