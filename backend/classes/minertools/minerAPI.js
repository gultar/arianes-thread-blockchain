const { logger } = require('../../tools/utils')
const EventEmitter = require('events')
const { Worker } = require('worker_threads')

class MinerAPI{
    constructor({ chain, mempool, channel, sendPeerMessage, keychain, clusterMiner }){
        this.chain = chain
        this.mempool = mempool
        this.channel = channel
        this.sendPeerMessage = sendPeerMessage
        this.keychain = keychain
        this.clusterMiner = clusterMiner
        this.worker = {}
        this.isWorkerBusy = false;
        this.isAPIBusy = false;
    }

    init(){
        this.worker = new Worker('./backend/classes/minertools/minerWorker.js', {
            workerData:{
                keychain:this.keychain,
                clusterMiner:this.clusterMiner,
                verbose:this.verbose
            },
            ressourceLimits:{
                maxOldGenerationSizeMb:256
            }
        })
        
        this.worker.on('error', err => console.log('Bootstrap Error',err))
        this.worker.on('exit', ()=>{ })
        this.worker.on('message', async (message)=>{

            if(message.isMining) this.isWorkerBusy = true
            else if(message.isPreparing) this.isWorkerBusy = true
            else if(message.isStopped) this.isWorkerBusy = false
            else if(message.success){
                this.isAPIBusy = true
                let added = await this.addMinedBlock(message.success)
                this.isAPIBusy = false
            }
            else if(message.failed){
                console.log('Mining failed')
            }
        })
        this.channel.on('nodeEvent', (event)=>{
            switch(event){
                case 'isBusy':
                    this.isAPIBusy = true
                    break;
                case 'isAvailable':
                    this.isAPIBusy = false
                    break;
                case 'stopMining':
                    this.worker.postMessage({ stop:true })
                    break;
            }
        })
        
        this.mempool.events.on('newAction', async (action)=>{
            if(!this.isAPIBusy && !this.isWorkerBusy){
                await this.sendNewBlock()
            }
        })
        this.mempool.events.on('newTransaction', async (transaction)=>{
             if(!this.isAPIBusy && !this.isWorkerBusy){
                await this.sendNewBlock()
            }
        })

        

    }

    async addMinedBlock(block){
        let isValid = await this.chain.validateBlock(block)
        if(isValid){
          if(isValid.error) logger('INVALID BLOCK', isValid.error)
          else{
            let added = await this.chain.addBlockToChain(block)
            if(added.error)logger('MINEDBLOCK ERROR:',added.error)
            else{
              this.sendPeerMessage('newBlockFound', block);
            }
            return block
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
            this.worker.postMessage({ previousBlock:latestBlock })
            this.worker.postMessage({ mine:newRawBlock })
        }else{
            logger('RAW BLOCK ERROR:', newRawBlock)
        }
    }

    async createRawBlock(nextBlock){
        
        let latest = await this.getLatestFullBlock()
        let deferredTxManaged = await this.mempool.manageDeferredTransactions(latest)
        if(deferredTxManaged.error) return { error:deferredTxManaged.error }

        let transactions = await this.mempool.gatherTransactionsForBlock()
        if(transactions.error) return { error:transactions.error }
        transactions = await this.chain.validateTransactionsBeforeMining(transactions)

        let deferredActionsManaged = await this.mempool.manageDeferredActions(latest)
        if(deferredActionsManaged.error) return { error:deferredActionsManaged.error }

        let actions = await this.mempool.gatherActionsForBlock()
        if(actions.error) return { error:actions.error }
        actions = await this.chain.validateActionsBeforeMining(actions)
        if(Object.keys(transactions).length == 0 && Object.keys(actions).length == 0) return { error:'ERROR: Could not create block without transactions or actions' }
        
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
        let block = await this.chain.getBlockFromDB(latestHeader.blockNumber)
        if(!block || block.error){
          block = await this.chain.getBlockFromDB(latestHeader.blockNumber - 1)
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