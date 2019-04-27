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

const isValidWalletRequestJSON = (transaction)=>{
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



const isValidGetNextBlockJSON = (blockRequest) =>{
    var v = new Validator();

    

    var blockRequestSchema = {
        "id":"/getNextBlock",
        "type": "object",
        "properties": {
            "hash": {"type": "string"},
            "header":{"type":"string"}

        },
        "required": ["hash", "header"]
    };

    

    if(blockRequest){
        v.addSchema(blockRequestSchema, "/getNextBlock")
        let valid = v.validate(blockRequest, blockRequestSchema);
        
        if(valid.errors.length == 0){
            return true
        }else{
            return false;
        }
        
    }
}

const isValidHeaderJSON = (header)=>{
    var v = new Validator();
    var headerSchema = {
        "id":"/blockHeader",
        "type":"object",
        "header":{"type":"object"},
            "properties":{
                "blockNumber":{"type":"number"},
                "timestamp":{"type":"number"},
                "previousHash":{"type":"string"},
                "hash":{"type":"string"},
                "nonce":{"type":"number"},
                "merkleRoot":{"type":"string"}
            },
        "required": ["blockNumber", "timestamp", "previousHash", "hash", "nonce", "merkleRoot"]
    }

    if(header){
        v.addSchema(headerSchema, "/getNextBlock")
        let valid = v.validate(header, headerSchema);
        
        if(valid.errors.length == 0){
            return true
        }else{
            return false;
        }
        
    }
}

module.exports = { 
    isValidTransactionJSON, 
    isValidChainLengthJSON, 
    isValidWalletRequestJSON, 
    isValidGetNextBlockJSON,
    isValidHeaderJSON,
 };