const getFunctionArguments = require('get-function-arguments')

function createContractInterface(object){
    return new Promise(async (resolve)=>{
        let contractInterface = {}

        //Get all properties
        for(var property of Object.keys(object)){
            
            contractInterface[property]= {
                type:typeof object[property],
                name:property,
                
            }
            if(Array.isArray(object[property])){
                contractInterface[property] = object[property]
            }
            if(typeof object[property] == 'object' && property !== 'args'){
                contractInterface[property] = await createContractInterface(object[property])
            }
            
        }
        
        resolve(contractInterface)

    })
}

module.exports = createContractInterface