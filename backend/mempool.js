const fs = require('fs')
const { readFile } = require('./utils')
class Mempool{
    constructor(){
        this.pendingTransactions = {};
        this.rejectedTransaction = {};
    }

    async saveMempool(){
        let mempoolFile = await readFile('mempool.json');
        if(mempoolFile){
            try{
                let mempool = JSON.parse(mempoolFile);
                console.log(mempool)
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

myMempool = new Mempool();
myMempool.pendingTransactions['hello'] = 'boo'
myMempool.saveMempool();
myMempool.pendingTransactions['Poubelle'] = 'ce cours'
myMempool.saveMempool();

module.exports = Mempool;