const http = require('http')
const socketIo = require('socket.io')
const { logger } = require('../../tools/utils')

class MinerAPI{
    constructor({ chain, mempool, channel, sendPeerMessage, socket }){
        this.chain = chain
        this.mempool = mempool
        this.channel = channel
        this.sendPeerMessage = sendPeerMessage
        this.isMinerBusy = false;
        this.isAPIBusy = false;
        this.socket = socket
    }

    init(){
        this.socket.on('success', async(block) => {
            this.isAPIBusy = true
            await this.addMinedBlock(block)
            this.isAPIBusy = false
        })
        this.socket.on('isStopped', ()=>{ this.isMinerBusy = false })
        this.socket.on('isMining', ()=>{ this.isMinerBusy = true })
        this.socket.on('isPreparing', ()=>{ this.isMinerBusy = true })
        this.channel.on('nodeEvent', (event)=>{
            switch(event){
                case 'isBusy':
                    this.isAPIBusy = true
                    break;
                case 'isAvailable':
                    this.isAPIBusy = false
                    break;
                case 'stopMining':
                    //Stop miner
                    this.socket.emit('stopMining')
                    break;
            }
        })
        
        this.mempool.events.on('newAction', async (action)=>{
            if(!this.isAPIBusy && !this.isMinerBusy){
                await this.sendNewBlock()
            }
        })
        this.mempool.events.on('newTransaction', async (transaction)=>{
             if(!this.isAPIBusy && !this.isMinerBusy){
                await this.sendNewBlock()
            }
        })
    }

    async addMinedBlock(block){
        let isValid = await this.chain.validateBlock(block)
        if(isValid){
          if(isValid.error) logger('INVALID BLOCK', isValid.error)
          else{
            let exists = await this.chain.getBlockFromDB(block.blockNumber)
            if(!exists){
                this.sendPeerMessage('newBlockFound', block);
                let added = await this.chain.addBlockToChain(block)
                if(added.error)logger('MINEDBLOCK ERROR:',added.error)
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

    async sendNewBlock(){
        let latestBlock = await this.getLatestFullBlock()
        let newRawBlock = await this.createRawBlock(latestBlock)
        if(!newRawBlock.error) {
            this.socket.emit('previousBlock', latestBlock)
            this.socket.emit('rawBlock', newRawBlock)
        }else{
            logger('RAW BLOCK ERROR:', newRawBlock)
        }
    }

    async createRawBlock(nextBlock){
        
        let latest = await this.getLatestFullBlock()
        let deferredTxManaged = await this.mempool.manageDeferredTransactions(latest)
        if(deferredTxManaged.error) console.log({ error:deferredTxManaged.error })

        let transactions = await this.mempool.gatherTransactionsForBlock()
        if(transactions.error) return { error:transactions.error }

        transactions = await this.chain.validateTransactionsBeforeMining(transactions)

        let deferredActionsManaged = await this.mempool.manageDeferredActions(latest)
        if(deferredActionsManaged.error) console.log({ error:deferredActionsManaged.error })

        let actions = await this.mempool.gatherActionsForBlock()
        if(actions.error) return { error:actions.error }

        actions = await this.chain.validateActionsBeforeMining(actions)

        if(Object.keys(transactions).length == 0 && Object.keys(actions).length == 0){
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

    async getBlock({blockNumber}){
        let block = await this.chain.getBlockFromDB(blockNumber)
        if(!block || block.error) return false;
        else return block
    }

    async getLatestFullBlock(){
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