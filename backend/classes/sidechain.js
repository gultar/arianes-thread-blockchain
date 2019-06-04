const { isValidBlockJSON } = require('../tools/jsonvalidator')

class Sidechain{
    constructor(mainChain){
        this.mainChain = mainChain;
        this.sideChain = sideChain;
    }

    async compareWork(){
        let mainWorkDone = await this.calculateWorkDone(this.mainChain);
        let sideWorkDone = await this.calculateWorkDone(this.sideChain);
        if(mainWorkDone && sideWorkDone){
            return (sideWorkDone > mainWorkDone ? {sideChain:this.sideChain} : {mainChain:this.mainChain})
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

module.exports = Sidechain;