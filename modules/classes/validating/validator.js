const { RecalculateHash, } = require('../../tools/utils');
const { isValidHeaderJSON } = require('../../tools/jsonvalidator');
  
const Miner = require('../mining/miner/miner')
const {Difficulty} = require('../mining/challenge')
const Block = require('../blockchain/block')
const ECDSA = require('ecdsa-secp256r1')
const Mempool = require('../mempool/pool')
const genesis = require('../../tools/getGenesis')
const ioClient = require('socket.io-client')

class Validator extends Miner{
    constructor({ keychain, numberOfCores, miningReward, verbose }){
        super({ keychain, numberOfCores, miningReward, verbose })
        this.mempool = new Mempool()
        this.generationSpeed = genesis.blockTime * 1000 || 2000//generationSpeed 
        this.generator = {}
        this.validators = {}
        this.validatorKeys = [this.wallet.publicKey]
        this.turnCounter = 0
        this.nextTurn = this.validatorKeys[0]
        this.nextTurnSkipped = setTimeout(()=>{})
        this.blocksToBeSigned = {}
    }

    connect(url){
        if(!url) throw new Error('Valid URL is Required')
        
        let config = {
          query:
              {
                token: 'InitMiner',
              }
        }
        this.socket = ioClient(url, config)
        this.socket.on('connect', async ()=>{
            this.log('Miner connected to ', url)
            await this.initWallet()
            this.validators[this.wallet.publicKey] = 0
            this.socket.emit('isAvailable')
            this.socket.emit('generate')
            this.generateBlocks()
            this.sendPeerMessage('networkEvent', { type:'validatorConnected', publicKey:this.wallet.publicKey })
        })
        this.socket.on('disconnect', async ()=>{
          this.sendPeerMessage('networkEvent', { type:'validatorDisconnected', publicKey:this.wallet.publicKey })
          this.socket.close()
          process.exit()
        })
        this.socket.on('networkEvent', async (peerMessage)=>{
            let event = JSON.parse(peerMessage.data)
            switch(event.type){
                case 'discoverValidator':
                    clearInterval(this.generator)
                    // this.pickTurns()
                    this.validators[event.publicKey] = 0
                    this.validatorKeys = Object.keys(this.validators)
                    break;
                case 'validatorConnected':
                    this.validators[event.publicKey] = 1
                    this.validatorKeys = Object.keys(this.validators)
                    this.sendPeerMessage('networkEvent', { type:'discoverValidator', publicKey:this.wallet.publicKey })
                    break;
                case 'validatorDisconnected':
                    delete this.validators[event.publicKey]
                    this.validatorKeys = Object.keys(this.validators)
                    break;
                case 'requestSignature':
                    console.log('Hey', event)
                    let header = event.header;
                    let isValidHeader = this.validateBlockHeader(header)
                    if(isValidHeader){
                        let signature = await this.createSignature(header.hash)
                        this.sendPeerMessage('networkEvent', { type:'signature', signature:signature, hash:header.hash, publicKey:this.wallet.publicKey })
                    }
                    
                    break;
                case 'signature':
                    console.log('Signature:', event)
                    let hash = event.hash
                    let block = this.blocksToBeSigned[hash]
                    block.signatures[event.publicKey] = event.signature
                    if(Object.keys(block.signatures) >= genesis.minimumSignatures){
                        this.wait = false
                        this.socket.emit('success', block)
                    }
                    break;
            }
        })
        this.socket.on('previousBlock', (block)=> this.previousBlock = block)
        this.socket.on('rawBlock', async (rawBlock)=> await this.start(rawBlock))
        // this.socket.on('stopMining', async ()=> await this.stop())
    }

    async start(rawBlock){
        this.socket.emit('isPreparing')
        let block = await this.prepareBlockForMining(rawBlock);
        if(block){
            this.socket.emit('isMining')

            this.log('Starting to mint block '+block.blockNumber)
            this.log('Number of transactions being minted: ', Object.keys(block.transactions).length)
            this.log('Number of actions being minted: ', Object.keys(block.actions).length)
            this.log('Current difficulty:', BigInt(parseInt(block.difficulty, 16)))

            let success = false
            
            success = await block.produce(block.difficulty, this.numberOfCores)
            if(success){
                this.successMessage(success)
                this.stop()
                block = success;
                block.endMineTime = Date.now()
                this.previousBlock = block;
                block.signatures[this.wallet.publicKey] = await this.createSignature(block.hash)
                this.sendPeerMessage('networkEvent', { type:'requestSignature', publicKey:this.wallet.publicKey, header:this.extractHeader(block) })
                this.blocksToBeSigned[block.hash] = block
                this.wait = true
            }else{
                this.log('Mining failed')
                this.socket.emit('failed')
            }
        }
    }

    async prepareBlockForMining(rawBlock){
        
        let coinbase = await this.createCoinbase()
        rawBlock.transactions[coinbase.hash] = coinbase

        let block = new Block({
          blockNumber:rawBlock.blockNumber,
          timestamp:Date.now(),
          transactions:rawBlock.transactions,
          actions:rawBlock.actions,
          previousHash:rawBlock.previousHash
        })

        block.startMineTime = Date.now()
        block.coinbaseTransactionHash = coinbase.hash
        //Set difficulty level
        let difficulty = new Difficulty(this.genesis)
        block.difficulty = difficulty.setNewDifficulty(this.previousBlock, block);
        block.challenge = difficulty.setNewChallenge(block)
        block.totalDifficulty = this.calculateTotalDifficulty(block)
        block.minedBy = this.wallet.publicKey;
        return block
    }

    calculateTotalDifficulty(block){
      return (BigInt(parseInt(this.previousBlock.totalDifficulty, 16)) + BigInt(parseInt(block.difficulty, 16))).toString(16)
    }

    
    async createSignature(hash){
        let unlocked = await this.wallet.unlock(this.keychain.password)
        let signature = await this.wallet.sign(hash)

        let pubKey = ECDSA.fromCompressedPublicKey(this.wallet.publicKey)
        let isValid = pubKey.verify(hash, signature)
        if(!isValid) this.createSignature(hash)
        else return signature
    }

    sendPeerMessage(type, data){
        this.socket.emit('sendPeerMessage', type, data)
    }

    generateBlocks(speed = this.generationSpeed){
        this.generator = setInterval(async ()=>{
                if(!this.wait) this.socket.emit('sendRawBlock')
        }, speed)
    }

    validateBlockHeader(header){
        if(isValidHeaderJSON(header)){
          if(header.hash == RecalculateHash(header)) return true;
          else return false;
        }else return false;
      }

    extractHeader(block){
        var header = {
          blockNumber:block.blockNumber,
          timestamp:block.timestamp,
          previousHash:block.previousHash,
          hash:block.hash,
          nonce:block.nonce,
          merkleRoot:block.merkleRoot,
          actionMerkleRoot:block.actionMerkleRoot,
          difficulty:block.difficulty,
          totalDifficulty:block.totalDifficulty,
          challenge:block.challenge,
          txHashes:(block.transactions? Object.keys(block.transactions) : []),
          actionHashes:(block.actions ? Object.keys(block.actions):[]),
          minedBy:block.minedBy,
          signatures:block.signatures
        }
    
        if(block.actions){
          header.actionHashes = Object.keys(block.actions)
        }
    
        return header
      }

    disconnect(){
        this.sendPeerMessage('networkEvent', { type:'validatorDisconnected', publicKey:this.wallet.publicKey })
    }

    
}

module.exports = Validator