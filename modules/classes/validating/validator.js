const Miner = require('../mining/miner/miner')
const ECDSA = require('ecdsa-secp256r1')

class Validator extends Miner{
    constructor({ keychain, numberOfCores, miningReward, verbose }){
        super({ keychain, numberOfCores, miningReward, verbose })
    }

    async start(rawBlock){
        this.socket.emit('isPreparing')
        let block = await this.prepareBlockForMining(rawBlock);
        if(block){
            this.socket.emit('isMining')

            this.log('Starting to mint block '+block.blockNumber)
            this.log('Number of transactions being mint: ', Object.keys(block.transactions).length)
            this.log('Number of actions being mint: ', Object.keys(block.actions).length)
            this.log('Current difficulty:', BigInt(parseInt(block.difficulty, 16)))

            let success = false
            
            success = await block.mine(block.difficulty, this.numberOfCores)
            if(success){
                this.successMessage(success)
                this.stop()
                block = success;
                block.endMineTime = Date.now()
                this.previousBlock = block;
                block.signatures[this.wallet.publicKey] = await this.createSignature(block.hash)
                this.socket.emit('success', block)

            }else{
                this.log('Mining failed')
                this.socket.emit('failed')
            }
        }
    }

    
    async createSignature(hash){
        let unlocked = await this.wallet.unlock(this.keychain.password)
        let signature = await this.wallet.sign(hash)

        let pubKey = ECDSA.fromCompressedPublicKey(this.wallet.publicKey)
        let isValid = pubKey.verify(hash, signature)
        if(!isValid) this.createSignature(hash)
        else return signature
      }
}

module.exports = Validator