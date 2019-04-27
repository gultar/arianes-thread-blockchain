const Validator = require('jsonschema').Validator;

const isValidTransactionJSON = (transaction)=>{
    var v = new Validator();
    var schema = {
        "id":"/transaction",
        "type": "object",
        "properties": {
            "sender": {"type": "string"},
            "receiver": {"type": "string"},
            "amount": {"type": "number"},
            "data": {"type": "string"}
        },
        "required": ["sender", "receiver", "amount"]
    };

    if(transaction){
        v.addSchema(schema, "/transaction")
        let valid = v.validate(transaction, schema);
        if(valid.errors.length == 0){
            return true
        }else{
            return false;
        }
        
    }
}

const isValidChainLengthJSON = (transaction)=>{
    var v = new Validator();
    var schema = {
        "id":"/chainLength",
        "type": "object",
        "properties": {
            "length": {"type": "number"},
            "peerAddress": {"type": "string"},
        },
        "required": ["length", "peerAddress"]
    };

    if(transaction){
        v.addSchema(schema, "/transaction")
        let valid = v.validate(transaction, schema);
        if(valid.errors.length == 0){
            return true
        }else{
            return false;
        }
        
    }
}

const isValidCreateWalletJSON = (transaction)=>{
    var v = new Validator();
    var schema = {
        "id":"/chainLength",
        "type": "object",
        "properties": {
            "name": {"type": "string"},
        },
        "required": ["name"]
    };

    if(transaction){
        v.addSchema(schema, "/transaction")
        let valid = v.validate(transaction, schema);
        if(valid.errors.length == 0){
            return true
        }else{
            return false;
        }
        
    }
}

module.exports = { isValidTransactionJSON, isValidChainLengthJSON, isValidCreateWalletJSON };