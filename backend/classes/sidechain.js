class Sidechain{
    constructor(mainChain){
        this.mainChain = mainChain;
        this.sideChain = sideChain;
    }

    compareWork(){
        let mainWorkDone = this.calculateWorkDone(mainChain);
        let sideWorkDone = this.calculateWorkDone(sideChain);
    }

    calculateWorkDone(chain){

    }
}