const { isValidBlockJSON } = require('./backend/tools/jsonvalidator')

class Sidechain{
    constructor(mainChain){
        this.mainChain = mainChain;
        this.sideChain = sideChain;
    }

    async compareWork(mainChain, sideChain){
        let mainWorkDone = await this.calculateWorkDone(mainChain);
        let sideWorkDone = await this.calculateWorkDone(sideChain);
        if(mainWorkDone && sideWorkDone){
            return (sideWorkDone > mainWorkDone ? {sideChain:sideChain} : {mainChain:mainChain})
        }else{
            return false;
        }
        
        
    }

    calculateWorkDone(chain){
        return new Promise(resolve =>{
            if(chain && typeof chain == 'array'){
                let totalWork = 0;
                chain.forEach(block => {
                    if(isValidBlockJSON(block)){
                        totalWork += block.nonce;
                    }else{
                        resolve(false)
                    }
                    
                });
    
                resolve(totalWork); 
            }else{
                resolve(false)
            }
        })
        
    }
}