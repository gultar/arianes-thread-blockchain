
const makeExternal = (properties) =>{
    let names = Object.keys(properties)
    let externalProperties = {}
    names.forEach( name=>{
        externalProperties[name] = properties[name]
    })

    return externalProperties
}

module.exports = makeExternal