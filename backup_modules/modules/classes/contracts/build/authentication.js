const ECDSA = require('ecdsa-secp256r1');
const { logger } = require('../../../tools/utils');

const authenticateAccount = (account) =>{
    return new Promise((resolve, reject)=>{
        if(account){
            try{
                const publicKey = ECDSA.fromCompressedPublicKey(account.ownerKey);
                resolve(publicKey.verify(account.hash, account.ownerSignature))
            }catch(e){
                console.log(e)
                logger('ERROR: An error occured while authenticating')
            }
        }
    })
    
}

const requireAuth = (data, signature, ownerKey) =>{
    return new Promise((resolve, reject)=>{
        if(data && signature && ownerKey){
            try{
                const publicKey = ECDSA.fromCompressedPublicKey(ownerKey); //Checks if signed by owner of contract
                resolve(publicKey.verify(data, signature))
            }catch(e){
                console.log(e)
                logger('ERROR: An error occured while authenticating')
                resolve(false)
            }
        }else{
            logger('ERROR: Missing authentication parameters')
            resolve(false)
        }
    })
}

module.exports = { authenticateAccount, requireAuth }