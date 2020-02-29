const http = require('http')
const socketIo = require('socket.io')
const { logger } = require('../tools/utils')
const { mempool } = require('../instances/mempool')
const apiLog = require('debug')('minerAPI')

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
    constructor({ mode, chain, addBlock, channel, sendPeerMessage, socket }){
        this.mode = mode
        this.chain = chain
        this.addBlock = addBlock
        this.channel = channel
        this.sendPeerMessage = sendPeerMessage
        this.isMinerBusy = false;
        this.isAPIBusy = false;
        this.socket = socket
        this.generate = false
    }

    init(){
        this.socket.on('success', async(block) => {
            
            await this.addMinedBlock(block)
            this.isAPIBusy = false;
        })
        this.socket.on('generate', ()=>{
            this.generate = true
        })
        this.socket.on('isStopped', ()=>{ this.isMinerBusy = false })
        this.socket.on('isMining', ()=>{ this.isMinerBusy = true })
        this.socket.on('isPreparing', ()=>{ this.isMinerBusy = true })
        this.socket.on('disconnect', ()=>{
            this.channel.removeAllListeners('nodeEvent')
            mempool.events.removeAllListeners('newAction')
            mempool.events.removeAllListeners('newTransaction')
        })
        //This is for when node is syncing a block or busy doing something else
        this.channel.on('nodeEvent', (event)=>{
            apiLog('Received node event', event)
            switch(event){
                case 'isBusy':
                    this.isAPIBusy = true
                    this.socket.emit('nodeIsBusy', true)
                    break;
                case 'isAvailable':
                    this.isAPIBusy = false
                    this.socket.emit('nodeIsBusy', false)
                    break;
                case 'isSwitchingBranch':
                case 'isDownloading':
                    this.isNodeWorking = true
                    this.socket.emit('nodeIsBusy', true)
                    break;
                case 'finishedSwitchingBranch':
                case 'finishedDownloading':
                    this.isNodeWorking = false
                    this.socket.emit('nodeIsBusy', false)
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

        this.socket.on('sendPeerMessage', async (type, data)=>{
            this.sendPeerMessage(type, data)
        })

        this.channel.on('pushedBlock', ()=>{
            this.socket.emit('pushedBlock')
        })
        
        mempool.events.on('newAction', async (action)=>{
            if(!this.isAPIBusy && !this.isMinerBusy && !this.isNodeWorking && this.mode !== 'generator'){
                await this.sendNewBlock()
            }
        })
        mempool.events.on('newTransaction', async (transaction)=>{
             if(!this.isAPIBusy && !this.isMinerBusy && !this.isNodeWorking && this.mode !== 'generator'){
                await this.sendNewBlock()
            }
        })
    }

    async addMinedBlock(block){
        let isValid = await this.chain.validateBlock(block)
        if(isValid){
          if(isValid.error){
            logger('INVALID BLOCK', isValid.error)
            // await this.unwrapBlock(block)
          }
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
                this.channel.emit('nodeEvent','isBusy')
                let added = await this.addBlock(block)
                this.channel.emit('nodeEvent','isAvailable')
                
                if(added.error){
                    logger('MINEDBLOCK:',added.error)
                    await this.unwrapBlock(block)
                }
                else return block
            }else{
                await this.unwrapBlock(block)
                return false
            }
          }
          
        }else{
          logger('ERROR: Mined Block is not valid!')
          logger(block)
          return false
        }
    }

    async sendNewBlock(forceSend=false){
        //Render busy to avoid sending a hundred raw blocks to the miner

        //Toggle busy flag as long as it takes for producer or miner to send back a new block
        this.isAPIBusy = true
        let latestBlock = await this.getLatestFullBlock()
        let newRawBlock = await this.createRawBlock(latestBlock, forceSend)
        if(!newRawBlock.error) {
            this.socket.emit('previousBlock', latestBlock)
            this.socket.emit('rawBlock', newRawBlock)
        }else{
            logger('RAW BLOCK ERROR:', newRawBlock)
        }
        // this.isAPIBusy = false
    }

    async createRawBlock(nextBlock, forceSend){
        
        let latest = await this.getLatestFullBlock()
        //Checks for tx deferred to next block
        let deferredTxManaged = await mempool.manageDeferredTransactions(latest)
        if(deferredTxManaged.error) console.log({ error:deferredTxManaged.error })

        let transactions = await mempool.gatherTransactionsForBlock()
        if(transactions.error) return { error:transactions.error }
        //Validate all transactions to be mined, delete those that are invalid
        transactions = await this.chain.validateTransactionsBeforeMining(transactions)
        
        //Checks for actions deferred to next block
        let deferredActionsManaged = await mempool.manageDeferredActions(latest)
        if(deferredActionsManaged.error) console.log({ error:deferredActionsManaged.error })

        let actions = await mempool.gatherActionsForBlock()
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
          let putback = await mempool.putbackTransactions(block)
          if(putback.error) return {error:putback.error}
          if(block.actions){
            let actionsPutback = await mempool.putbackActions(block)
            if(actionsPutback.error) return {error:actionsPutback.error}
          }
          return { transactions:putback, actions:putback }
        }else{
          return false
        }
    }
}

module.exports = MinerAPI