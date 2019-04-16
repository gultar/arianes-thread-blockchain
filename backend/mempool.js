const fs = require('fs')
const { readFile, writeToFile, createFile } = require('./utils')
class Mempool{
    constructor(){
        this.pendingTransactions = {};
        this.rejectedTransaction = {};
    }

    /***
     * In case of block rollback, add back all the transactions contained in the block
     * @param {object} $block - Block to deconstruct
    */
    putbackPendingTransactions(block){
        for(var txHash in Object.keys(block.transactions)){
            this.pendingTransactions[txHash] = block.transactions[txHash];
            delete block.transactions[txHash];
        }
    }

    async saveMempool(){
        let mempoolFile = await readFile('mempool.json');
        if(mempoolFile){
            try{
                let oldMempool = JSON.parse(mempoolFile);
                let newMempool = { ...this, ...oldMempool };
                var wstream = fs.createWriteStream('mempool.json');
                wstream.write(JSON.stringify(newMempool));
                wstream.end();
                console.log('Saved mempool')
            }catch(e){
                console.log(e);
            }
        }else{
            this.createMempool();
        }
    }

    createMempool(){
        fs.exists('mempool.json', async (exists)=>{
            if(!exists){

                let mempoolString = JSON.stringify(this);
                let wstream = fs.createWriteStream('mempool.json');

                wstream.write(mempoolString);
                wstream.end();
                console.log('Created mempool file')
            }else{
                console.log('File already exists')
            }
            
        })
        
    }
}


module.exports = Mempool;