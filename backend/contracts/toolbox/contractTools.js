const { loopOverMethods } = require('../../tools/utils')

const serializeActiveObject = (object) =>{
    return new Promise(async (resolve)=>{
        let methods = await loopOverMethods(object)
        let objectStr = {}
        if(methods && methods.length){
           
    
            for(var property in object){
                objectStr[property] = {
                    type:typeof object[property],
                    name:property,
                    value:object[property]
                }
            }
            methods.forEach( method=>{
                if(method){
                    objectStr[method] = { type:'function', name:method }
                }
            })
            resolve(JSON.stringify(objectStr, null, 2))
        }else{
            resolve(false)
        }
       
    })
}

const inheritFromClass = (childObject, ParentClass) =>{
    if(childObject && ParentClass){
        let parentObject = new ParentClass(childObject.className, childObject.creator, childObject.contractAccount)
        for(var property in parentObject){
            childObject[property] = parentObject[property]
        }
        for (let name of Object.getOwnPropertyNames(Object.getPrototypeOf(parentObject))) {
            let method = parentObject[name];
            if(name !== 'constructor'){
                childObject[name] = method
            }
            
        }
        return childObject
    }
    
}

module.exports = {serializeActiveObject, inheritFromClass}