const http = require('http')
const socketIo = require('socket.io')
const { logger } = require('../tools/utils')

/**
 * An api that links the miner process and the node and gathers transactions for it
 * @class
 * @param {Object} params - Api param object
 * @param {Blockchain} params.chain - A copy of the active blockchain
 * @param {Mempool} params.mempool - A copy of the active mempool
 * @param {EventEmitter} params.channel - Event emitter instance supplied by the node
 * @param {Function} params.sendPeerMessage - Function that will serve to broadcast new blocks
 * @param {Socket} params.socket - Server socket on which the miner will connect
 */
class MinerAPI{
    constructor({ chain, mempool, channel, sendPeerMessage, socket }){
        this.chain = chain
        this.mempool = mempool
        this.channel = channel
        this.sendPeerMessage = sendPeerMessage
        this.isMinerBusy = false;
        this.isAPIBusy = false;
        this.socket = socket
        this.generate = false
    }

    init(){
        this.socket.on('success', async(block) => {
            this.isAPIBusy = true
            await this.addMinedBlock(block)
            this.isAPIBusy = false
        })
        this.socket.on('generate', ()=>{
            this.generate = true
        })
        this.socket.on('isStopped', ()=>{ this.isMinerBusy = false })
        this.socket.on('isMining', ()=>{ this.isMinerBusy = true })
        this.socket.on('isPreparing', ()=>{ this.isMinerBusy = true })
        this.socket.on('disconnect', ()=>{
            this.channel.removeAllListeners('nodeEvent')
            this.mempool.events.removeAllListeners('newAction')
            this.mempool.events.removeAllListeners('newTransaction')
        })
        
        //This is for when node is syncing a block or busy doing something else
        this.channel.on('nodeEvent', (event)=>{
            switch(event){
                case 'isBusy':
                    this.isAPIBusy = true
                    break;
                case 'isAvailable':
                    this.isAPIBusy = false
                    break;
                case 'isSwitchingBranch':
                case 'isDownloading':
                    this.isNodeWorking = true
                    break;
                case 'finishedSwitchingBranch':
                case 'finishedDownloading':
                    this.isNodeWorking = false
                    break;
                case 'stopMining':
                    //Stop miner
                    this.socket.emit('stopMining')
                    break;
            }
        })

        this.socket.on('sendRawBlock', async ()=>{
            await this.sendNewBlock({ generate:true })
        })
        
        this.mempool.events.on('newAction', async (action)=>{

            if(!this.generate && !this.isAPIBusy && !this.isMinerBusy && !this.isNodeWorking){
                await this.sendNewBlock()
            }
        })
        this.mempool.events.on('newTransaction', async (transaction)=>{
             if(!this.generate && !this.isAPIBusy && !this.isMinerBusy && !this.isNodeWorking){
                 
                await this.sendNewBlock()
            }
        })
    }

    async addMinedBlock(block){
        let isValid = await this.chain.validateBlock(block)
        if(isValid){
          if(isValid.error) logger('INVALID BLOCK', isValid.error)
          else{
            //To guard against accidentally creating doubles
            let isNextBlock = block.blockNumber == this.chain.getLatestBlock().blockNumber + 1
            let headerExists = this.chain[block.blockNumber]
            if(!headerExists) headerExists = await this.chain.getBlockbyHash(block.hash)
            let exists = await this.chain.getBlockFromDB(block.blockNumber)
            if(!exists && !headerExists && isNextBlock){
                //Broadcast new block found
                this.sendPeerMessage('newBlockFound', block);
                //Sync it with current blockchain, skipping the extended validation part
                let added = await this.chain.receiveBlock(block)//addBlockToChain(block)
                if(added.error)logger('MINEDBLOCK:',added.error)
                else return block
            }else{
                return false
            }
          }
          
        }else{
          logger('ERROR: Mined Block is not valid!')
          logger(block)
        }
    }

    async sendNewBlock(forceSend=false){
        //Render busy to avoid send a hundred raw blocks to the miner
        this.isAPIBusy = true
        let latestBlock = await this.getLatestFullBlock()
        let newRawBlock = await this.createRawBlock(latestBlock, forceSend)
        if(!newRawBlock.error) {
            this.socket.emit('previousBlock', latestBlock)
            this.socket.emit('rawBlock', newRawBlock)
        }else{
            logger('RAW BLOCK ERROR:', newRawBlock)
        }
        this.isAPIBusy = false
    }

    async createRawBlock(nextBlock, forceSend){
        
        let latest = await this.getLatestFullBlock()
        //Checks for tx deferred to next block
        let deferredTxManaged = await this.mempool.manageDeferredTransactions(latest)
        if(deferredTxManaged.error) console.log({ error:deferredTxManaged.error })

        let transactions = await this.mempool.gatherTransactionsForBlock()
        if(transactions.error) return { error:transactions.error }
        //Validate all transactions to be mined, delete those that are invalid
        transactions = await this.chain.validateTransactionsBeforeMining(transactions)

        //Checks for actions deferred to next block
        let deferredActionsManaged = await this.mempool.manageDeferredActions(latest)
        if(deferredActionsManaged.error) console.log({ error:deferredActionsManaged.error })

        let actions = await this.mempool.gatherActionsForBlock()
        if(actions.error) return { error:actions.error }

        //Validate all actions to be mined, delete those that are invalid
        actions = await this.chain.validateActionsBeforeMining(actions)

        if(!forceSend && Object.keys(transactions).length == 0 && Object.keys(actions).length == 0){
            return { error:'ERROR: Could not create block without transactions or actions' }
        } 
        
        let rawBlock = {
            timestamp:Date.now(),
            transactions:transactions,
            actions:actions,
            previousHash:nextBlock.hash,
            blockNumber:nextBlock.blockNumber + 1
        }
        
        return rawBlock
    }

    // async getBlock({blockNumber}){
    //     let block = await this.chain.getBlockFromDB(blockNumber)
    //     if(!block || block.error) return false;
    //     else return block
    // }

    async getLatestFullBlock(){
        //Get the current header
        //Since the header is always added before running the entire block
        //We check to see if a block is currently being runned
        //If so, get the previous block
        let latestHeader = this.chain.getLatestBlock()
        let block = latestHeader
        if(latestHeader.blockNumber >= 1){
            let block = await this.chain.getBlockFromDB(latestHeader.blockNumber)
            if(!block || block.error){
                block = await this.chain.getBlockFromDB(latestHeader.blockNumber - 1)
            }
        }else{
            block = latestHeader
        }
        

        
    
        return block
    }

    //In case another peer finds a block, unwrap discarded block to add back transactions and actions
    async unwrapBlock(block){
        if(block){
          let putback = await this.mempool.putbackTransactions(block)
          if(putback.error) return {error:putback.error}
          if(block.actions){
            let actionsPutback = await this.mempool.putbackActions(block)
            if(actionsPutback.error) return {error:actionsPutback.error}
          }
          return { transactions:putback, actions:putback }
        }else{
          return false
        }
    }
}

module.exports = MinerAPI