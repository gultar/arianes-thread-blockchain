
const activePort = require('dotenv').config({ path: './config/.env' })
if (activePort.error) throw activePort.error
const nodeAddress = 'http://localhost:'+activePort.parsed.API_PORT
const ioClient = require('socket.io-client')
let block3195 = {
    "blockNumber": 3195,
    "timestamp": 1580911048950,
    "transactions": {
      "a22cf45c33a6f3891786f7fd0a0b67d16b0722bcf7a43ecd78abc89fa8bb0999": {
        "fromAddress": "tuor",
        "toAddress": "Tokens",
        "type": "call",
        "data": {
          "method": "issue",
          "cpuTime": 1,
          "params": {
            "symbol": "GOLD",
            "amount": 1,
            "receiver": "huor"
          }
        },
        "timestamp": 1580911048905,
        "amount": 0,
        "nonce": 0,
        "hash": "a22cf45c33a6f3891786f7fd0a0b67d16b0722bcf7a43ecd78abc89fa8bb0999",
        "miningFee": 0.0177,
        "delayToBlock": 0,
        "signature": "lg0V2R6iA/nIE+1NCpw4k4ivjf8sBNEyyxIXo6E3iXB3WoWFmQGm2uzJPqBgmAZHkMI0w5ExBZB+tIV5dOUFRQ=="
      },
      "16def9ef3daa6e14bfd55f5185ce1c8f66187ef31c41180b15c3dc64b0792133": {
        "fromAddress": "coinbase",
        "toAddress": "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG",
        "type": "",
        "data": "",
        "timestamp": 1580911048947,
        "amount": 50,
        "nonce": 0,
        "hash": "16def9ef3daa6e14bfd55f5185ce1c8f66187ef31c41180b15c3dc64b0792133",
        "miningFee": 0.0131,
        "delayToBlock": 0,
        "signature": "Ap1H7GRGOjXVZp5sqf+Ocedc8w+2cs6CzHLmploFW/tgj4kj3zgNMNpGB5XfWhvPx5c14385FzHaWb408lKJEQ=="
      }
    },
    "actions": {},
    "previousHash": "00047f7adfff65ce484d9c042e5fbfd8e5bfd89bff8835b1dd1872e4a3ffc105",
    "totalDifficulty": "5612c2f",
    "difficulty": "1038",
    "merkleRoot": "FB3978D27F0ECDBCCA836FDDC7483C7AD6B5EDA99FC26D7E9A4D2B8095080F43",
    "nonce": 1004558.0015885186,
    "hash": "00015e2579193275a00043fad82728cf53dc6b4d1cb063039519ccf6c32fe71b",
    "minedBy": "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG",
    "challenge": "7e460ada04eebc6c8431535c3d29ed419a63a3449007e460ada04eebc6c84",
    "startMineTime": 1580911048950,
    "endMineTime": 1580911049057,
    "coinbaseTransactionHash": "16def9ef3daa6e14bfd55f5185ce1c8f66187ef31c41180b15c3dc64b0792133",
    "signatures": {}
  }
  
let block3196 = {
    "blockNumber": 3196,
    "timestamp": 1580911049449,
    "transactions": {
      "b49d4e426751812365c3160b8a2242c0dd6e4ce2c6480aec0a7896e28e4c6f8e": {
        "fromAddress": "tuor",
        "toAddress": "Tokens",
        "type": "call",
        "data": {
          "method": "issue",
          "cpuTime": 1,
          "params": {
            "symbol": "GOLD",
            "amount": 1,
            "receiver": "huor"
          }
        },
        "timestamp": 1580911049414,
        "amount": 0,
        "nonce": 0,
        "hash": "b49d4e426751812365c3160b8a2242c0dd6e4ce2c6480aec0a7896e28e4c6f8e",
        "miningFee": 0.0177,
        "delayToBlock": 0,
        "signature": "deWk0HICjj4q0vpRHk0uDg7A7iSHUBNwGj0gYs0/x7GUm9HFTEBs3XY5DaOgMQJfYuMgFDRXTEoCbDz/gz3RjA=="
      },
      "b2b33307ecd14b2fad0d985870857edc58e426416cf15da6d8e6ffb88f96eb94": {
        "fromAddress": "coinbase",
        "toAddress": "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG",
        "type": "",
        "data": "",
        "timestamp": 1580911049446,
        "amount": 50,
        "nonce": 0,
        "hash": "b2b33307ecd14b2fad0d985870857edc58e426416cf15da6d8e6ffb88f96eb94",
        "miningFee": 0.0131,
        "delayToBlock": 0,
        "signature": "qbYY5JIwn6vEvV170dzCTpKKQ34cp5hUaNQ6cpI45/4b7UPNDeuBrgoUL36n4hjRH+LenhsnFoN8bYU8hflJhQ=="
      }
    },
    "actions": {},
    "previousHash": "00015e2579193275a00043fad82728cf53dc6b4d1cb063039519ccf6c32fe71b",
    "totalDifficulty": "5613c71",
    "difficulty": "1042",
    "merkleRoot": "A7210EDEDA29750E94A4D1C8B36793ADD426CD82D872B7D7754B95FBBD516C3E",
    "nonce": 2801114.9710778114,
    "hash": "0006944c5dda83d1ac576e0b2ab054c908dfa553393577b90970e8c20d35a833",
    "minedBy": "Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG",
    "challenge": "7df85f76385796b260332ce6c806e395387714ca3dc142cc749ef06072291",
    "startMineTime": 1580911049449,
    "endMineTime": 1580911049596,
    "coinbaseTransactionHash": "b2b33307ecd14b2fad0d985870857edc58e426416cf15da6d8e6ffb88f96eb94",
    "signatures": {}
  }
  

let block3197 = {
    "blockNumber": 3197,
    "timestamp": 1580911049980,
    "transactions": {
      "79415908b04c49f8d9fa8dc47161e30b66bed65a35a4dec8b55e9dba451c430e": {
        "fromAddress": "tuor",
        "toAddress": "Tokens",
        "type": "call",
        "data": {
          "method": "issue",
          "cpuTime": 1,
          "params": {
            "symbol": "GOLD",
            "amount": 1,
            "receiver": "huor"
          }
        },
        "timestamp": 1580911049946,
        "amount": 0,
        "nonce": 0,
        "hash": "79415908b04c49f8d9fa8dc47161e30b66bed65a35a4dec8b55e9dba451c430e",
        "miningFee": 0.0177,
        "delayToBlock": 0,
        "signature": "VFx0dK7m0kFeOoGUL8jaQ2vCQcqxfEZ1rldFmjomS6caRVfM2GV9cbxAgJg0ViYvWSy5gH1ngMHwISsZK9n8uw=="
      },
      "e57e2e6f835da67e7845207132bc42a8cbb0dfd44bde85965953007737e70640": {
        "fromAddress": "coinbase",
        "toAddress": "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
        "type": "",
        "data": "",
        "timestamp": 1580911049977,
        "amount": 50,
        "nonce": 0,
        "hash": "e57e2e6f835da67e7845207132bc42a8cbb0dfd44bde85965953007737e70640",
        "miningFee": 0.0131,
        "delayToBlock": 0,
        "signature": "+a64FHvOCI0iETL8qVnTtNtnBwHjhVo9z6NTArHoM6A+EMN7VtS+9aIgoqs6OzrmhEbhNHHcDikHlr8zrA1dNw=="
      }
    },
    "actions": {},
    "previousHash": "0006944c5dda83d1ac576e0b2ab054c908dfa553393577b90970e8c20d35a833",
    "totalDifficulty": "5614cbd",
    "difficulty": "104c",
    "merkleRoot": "CE49524979E5BF458D04193C5026724D7F36E3BEA3F7C21E88F7F3BB28D2028F",
    "nonce": 2908376.5601889663,
    "hash": "000054855283a4395eff1796f7754cd2ce82d0ddba4512affbb71b680ae0859f",
    "minedBy": "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
    "challenge": "7dab1363e57de9e8ed9770a8dde20e3c613250ff437f62ea27c321229b9cd",
    "startMineTime": 1580911049981,
    "endMineTime": 1580911050153,
    "coinbaseTransactionHash": "e57e2e6f835da67e7845207132bc42a8cbb0dfd44bde85965953007737e70640",
    "signatures": {}
  }
  

let block3198 = {
    "blockNumber": 3198,
    "timestamp": 1580911050582,
    "transactions": {
      "efd2405e89c61cd8d3bfff7193d3515a12daa6c716e4c884794fcfbfa454e4e4": {
        "fromAddress": "tuor",
        "toAddress": "Tokens",
        "type": "call",
        "data": {
          "method": "issue",
          "cpuTime": 1,
          "params": {
            "symbol": "GOLD",
            "amount": 1,
            "receiver": "huor"
          }
        },
        "timestamp": 1580911050525,
        "amount": 0,
        "nonce": 0,
        "hash": "efd2405e89c61cd8d3bfff7193d3515a12daa6c716e4c884794fcfbfa454e4e4",
        "miningFee": 0.0177,
        "delayToBlock": 0,
        "signature": "w4eUMp3a4Tm2BRFr4YJxkFn56Ivq9uL8a7uanPJhxXfp2ZdzFY6umzJa1SJyOCb/ZWgOYVCrFLQzzNq8TF6SYg=="
      },
      "b5bdf49c2fe48d99e85a0430807adbe9c48e8d73c714748418dcfca6e98875eb": {
        "fromAddress": "coinbase",
        "toAddress": "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
        "type": "",
        "data": "",
        "timestamp": 1580911050578,
        "amount": 50,
        "nonce": 0,
        "hash": "b5bdf49c2fe48d99e85a0430807adbe9c48e8d73c714748418dcfca6e98875eb",
        "miningFee": 0.0131,
        "delayToBlock": 0,
        "signature": "XpaWIWaimjQ4dZeBEsvSGk7oWbjEdshBRpMzIFtsRpDLe7gBzRzrATH0VDuDuaJFhxZSr696tI82tQ3PQ3ZkkQ=="
      }
    },
    "actions": {},
    "previousHash": "000054855283a4395eff1796f7754cd2ce82d0ddba4512affbb71b680ae0859f",
    "totalDifficulty": "5615d13",
    "difficulty": "1056",
    "merkleRoot": "19A50AA8DC9D93215FBE013EC8551EFE50622484A3B6C6AE3D80A0F2C128B76F",
    "nonce": 1004202.73928061,
    "hash": "000715886783b0572442d690c352f61d1516f0eda773576a06bb3c4ce71767ff",
    "minedBy": "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
    "challenge": "7d5e25f4007d5e25f4007d5e25f4007d5e25f4007d5e25f4007d5e25f4007",
    "startMineTime": 1580911050582,
    "endMineTime": 1580911050664,
    "coinbaseTransactionHash": "b5bdf49c2fe48d99e85a0430807adbe9c48e8d73c714748418dcfca6e98875eb",
    "signatures": {}
  }
  
let block3199 = {
    "blockNumber": 3199,
    "timestamp": 1580911051093,
    "transactions": {
      "2411fd111510a357ca74c586e5c74a4458aeb481f4953c77059c15ed1dc0d696": {
        "fromAddress": "tuor",
        "toAddress": "Tokens",
        "type": "call",
        "data": {
          "method": "issue",
          "cpuTime": 1,
          "params": {
            "symbol": "GOLD",
            "amount": 1,
            "receiver": "huor"
          }
        },
        "timestamp": 1580911051049,
        "amount": 0,
        "nonce": 0,
        "hash": "2411fd111510a357ca74c586e5c74a4458aeb481f4953c77059c15ed1dc0d696",
        "miningFee": 0.0177,
        "delayToBlock": 0,
        "signature": "ZlcxOJjCXyy67a7HUpQkblcXRqHpOAtYL+0cFTzF/vqOqRn327p9VZLUDVAzQChfzSMr8QKDJS8dCF4EFOkNYg=="
      },
      "4c0868fba7855f562acf2f1a9dcab8692c9745f133268fdb4b00e7e25ef97044": {
        "fromAddress": "coinbase",
        "toAddress": "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
        "type": "",
        "data": "",
        "timestamp": 1580911051089,
        "amount": 50,
        "nonce": 0,
        "hash": "4c0868fba7855f562acf2f1a9dcab8692c9745f133268fdb4b00e7e25ef97044",
        "miningFee": 0.0131,
        "delayToBlock": 0,
        "signature": "73MjPv68C/e5lGN2CY8/IuUG7pOswSqBTIQYMUcnF4LVK4NeyqTE9pE8OfZG/e2ZMGit4syvuBl9NA5iBzBvsw=="
      }
    },
    "actions": {},
    "previousHash": "000715886783b0572442d690c352f61d1516f0eda773576a06bb3c4ce71767ff",
    "totalDifficulty": "5616d73",
    "difficulty": "1060",
    "merkleRoot": "F9FE8A42F9C03F43A3D00BEB4737E518573FE89F4C56BC1451F2E66F57B90F81",
    "nonce": 14290682.519048706,
    "hash": "000427213ae2d411b4ea026e27ea304ef7349f6e3d356878079c308c7246d714",
    "minedBy": "A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr",
    "challenge": "7d1196792909c55fc17734c36b7b1d501f44659e4a427157f05dcd30dadec",
    "startMineTime": 1580911051093,
    "endMineTime": 1580911051356,
    "coinbaseTransactionHash": "4c0868fba7855f562acf2f1a9dcab8692c9745f133268fdb4b00e7e25ef97044",
    "signatures": {}
  }
  
  
const openSocket = async (address, runFunction) =>{
    let socket = ioClient(address, {'timeout':1000, 'connect_timeout': 1000});
    setTimeout(()=>{
        socket.close()
    },1000)
    if(socket){
        runFunction(socket);
    }else{
        console.log('Could not connect to node')
    }
}

const wait = async (block, socket, time) =>{
    setTimeout(()=>{ 
        socket.emit('testPush', { block:block, forReal:false })
        return true
    }, time)
}

let Sblock3191 = `{"3191":{"blockNumber":3191,"timestamp":1580911040588,"transactions":{"19c3d7b857292b21b7b463ecb8908a3bec8bb6c8a88ea6cc440eb0f578e44c0c":{"fromAddress":"tuor","toAddress":"Tokens","type":"call","data":{"method":"issue","cpuTime":1,"params":{"symbol":"GOLD","amount":1,"receiver":"huor"}},"timestamp":1580911040566,"amount":0,"nonce":0,"hash":"19c3d7b857292b21b7b463ecb8908a3bec8bb6c8a88ea6cc440eb0f578e44c0c","miningFee":0.0177,"delayToBlock":0,"signature":"RgRIcsgK/G8+cmPZPzrm5XOsTeT1LZ8oTAw8lERgt675J6sMHBoAnieE/2A0ivlO71+nrolO16cAntUqtkN2gQ=="},"d98375c64769b8057f88b73e5c78f97c6395ebe9deb79ec7574f6bec144444b7":{"fromAddress":"coinbase","toAddress":"Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG","type":"","data":"","timestamp":1580911040586,"amount":50,"nonce":0,"hash":"d98375c64769b8057f88b73e5c78f97c6395ebe9deb79ec7574f6bec144444b7","miningFee":0.0131,"delayToBlock":0,"signature":"58sZJHN2i5kVypUu83BN0cSeYtzcLkjQWtGVxmevJrtMVZemrfIWYlwl2Ff4nQGnBVovbcNY22ELP5dYgVx23g=="}},"actions":{},"previousHash":"000308163af2d684155ae122b285a0753c08bd05e6bff845b48cde74d95108d6","totalDifficulty":"560ead7","difficulty":"1060","merkleRoot":"77D3795D386DF47F3D3E5E05557074130EEB947C486B681884D742DA62965E25","nonce":88690.16413485155,"hash":"0000ce24a80a77f80564e904b0a5770126f259b1cdd3f5e12f574ea0316a0aa1","minedBy":"Axr7tRA4LQyoNZR8PFBPrGTyEs1bWNPj5H9yHGjvF5OG","challenge":"7d1196792909c55fc17734c36b7b1d501f44659e4a427157f05dcd30dadec","startMineTime":1580911040589,"endMineTime":1580911040668,"coinbaseTransactionHash":"d98375c64769b8057f88b73e5c78f97c6395ebe9deb79ec7574f6bec144444b7","signatures":{}},"_id":"3191"}`

let Sblock3192 = `{"3192":{"blockNumber":3192,"timestamp":1580911041620,"transactions":{"e97ea4e406ceb482af07b691386018a81dbd8714076c3dcb6b54297cee31b391":{"fromAddress":"tuor","toAddress":"Tokens","type":"call","data":{"method":"issue","cpuTime":1,"params":{"symbol":"GOLD","amount":1,"receiver":"huor"}},"timestamp":1580911041578,"amount":0,"nonce":0,"hash":"e97ea4e406ceb482af07b691386018a81dbd8714076c3dcb6b54297cee31b391","miningFee":0.0177,"delayToBlock":0,"signature":"LkC+olePMSnX3P/Vs4L2TVd3xuAfEijQFQP9XQfWYyKPv6mHDXnE1LkE8DODUMs4ygYmm7abBcoR3sYuH++Jaw=="},"3f70cf2f65ea92fa2355082d5decb62de2db9e5f549620a437dbc8b3e94d9427":{"fromAddress":"coinbase","toAddress":"A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr","type":"","data":"","timestamp":1580911041618,"amount":50,"nonce":0,"hash":"3f70cf2f65ea92fa2355082d5decb62de2db9e5f549620a437dbc8b3e94d9427","miningFee":0.0131,"delayToBlock":0,"signature":"+9Fj8GVMxqs+IsstTtZ0tx9PzbVCsSZFZLAJaioi/XQzuKvO+2kjy2q2mgeAcwPb82meTDrrwfiRNzdTk+mMtg=="}},"actions":{},"previousHash":"0000ce24a80a77f80564e904b0a5770126f259b1cdd3f5e12f574ea0316a0aa1","totalDifficulty":"560fb37","difficulty":"1060","merkleRoot":"E6F9D70D28EDC5304EE7EED97BA923BD4E4AE69E7C80B60D6B090610EDD7AA55","nonce":2440077.8157264767,"hash":"000637ffd65acf57ec1cd8a1f1819910d6a4b2bb76ef6e8d42db1f8a47cf4d6f","minedBy":"A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr","challenge":"7d1196792909c55fc17734c36b7b1d501f44659e4a427157f05dcd30dadec","startMineTime":1580911041620,"endMineTime":1580911041753,"coinbaseTransactionHash":"3f70cf2f65ea92fa2355082d5decb62de2db9e5f549620a437dbc8b3e94d9427","signatures":{}},"_id":"3192"}`
let Sblock3193 = `{"3193":{"blockNumber":3193,"timestamp":1580911042635,"transactions":{"ad3939dadded2747b89ba20ea7e3187ca1a0c926f5d9637634fbda899c937819":{"fromAddress":"tuor","toAddress":"Tokens","type":"call","data":{"method":"issue","cpuTime":1,"params":{"symbol":"GOLD","amount":1,"receiver":"huor"}},"timestamp":1580911042603,"amount":0,"nonce":0,"hash":"ad3939dadded2747b89ba20ea7e3187ca1a0c926f5d9637634fbda899c937819","miningFee":0.0177,"delayToBlock":0,"signature":"sZUivXwFb+vp8iipQ/ppys6BA0AOnsH3WZADfz8Me+kEDU/M3QuipXuQwXq0O90UOXWYx70HWQYEZRUc7qgamg=="},"b0d7ff2050dded0322244ed76c7a6d9e3fa5f936d6d0eab34730e6348ed01a63":{"fromAddress":"coinbase","toAddress":"A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr","type":"","data":"","timestamp":1580911042634,"amount":50,"nonce":0,"hash":"b0d7ff2050dded0322244ed76c7a6d9e3fa5f936d6d0eab34730e6348ed01a63","miningFee":0.0131,"delayToBlock":0,"signature":"8wu+fKjJNoW421Eq/IaTQOaRyXLCdEGlTQmqz6XvMOYWzJXjjvLPnoDLLe9qFHc9XzVeie4HBku2wR2F00bK2w=="}},"actions":{},"previousHash":"000637ffd65acf57ec1cd8a1f1819910d6a4b2bb76ef6e8d42db1f8a47cf4d6f","totalDifficulty":"5610b97","difficulty":"1060","merkleRoot":"B31B0B460A7696390DFDC62422541E1C97BE055B5548CBB29F8ACC487BB2EE3F","nonce":839533.7792588391,"hash":"00039072f2095e0a5a4a006a0f9ff755966ef695b104b97041077d245d21279a","minedBy":"A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr","challenge":"7d1196792909c55fc17734c36b7b1d501f44659e4a427157f05dcd30dadec","startMineTime":1580911042636,"endMineTime":1580911042718,"coinbaseTransactionHash":"b0d7ff2050dded0322244ed76c7a6d9e3fa5f936d6d0eab34730e6348ed01a63","signatures":{}},"_id":"3193"}`
let Sblock3194 = `{"3194":{"blockNumber":3194,"timestamp":1580911043719,"transactions":{"76fda07f95a3883e8b2993c3c99c3187a312bf370a7f1fbeb8a7619211b268a9":{"fromAddress":"tuor","toAddress":"Tokens","type":"call","data":{"method":"issue","cpuTime":1,"params":{"symbol":"GOLD","amount":1,"receiver":"huor"}},"timestamp":1580911043694,"amount":0,"nonce":0,"hash":"76fda07f95a3883e8b2993c3c99c3187a312bf370a7f1fbeb8a7619211b268a9","miningFee":0.0177,"delayToBlock":0,"signature":"DSLY4JzXp1cZE4LBe2t1hDAN8ZnDuXOTzL+oXXUxl0nVUrcWqqNhNNUUaHPpf+t2TTNRJQheaHfgVAIdbaCOQw=="},"7dfaa5ee7b5c2c4116fa72af53b95c1201aae3f3008f113222050edf6d483d9c":{"fromAddress":"coinbase","toAddress":"A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr","type":"","data":"","timestamp":1580911043717,"amount":50,"nonce":0,"hash":"7dfaa5ee7b5c2c4116fa72af53b95c1201aae3f3008f113222050edf6d483d9c","miningFee":0.0131,"delayToBlock":0,"signature":"2+dlAfJwQZbCCUFcq9U1CApavWZpOJ47SSOGbwX8Jsqi45S5RTylATexOzT6GVByC56ph37d3sZ+/0qdwlNwUQ=="}},"actions":{},"previousHash":"00039072f2095e0a5a4a006a0f9ff755966ef695b104b97041077d245d21279a","totalDifficulty":"5611bf7","difficulty":"1060","merkleRoot":"86D167FBFD4BC7261DFD7AA2510DEB91C67903E6311A746ED680FE82BBBDB3DE","nonce":57124.83215630621,"hash":"00047f7adfff65ce484d9c042e5fbfd8e5bfd89bff8835b1dd1872e4a3ffc105","minedBy":"A64j8yr8Yl4inPC21GwONHTXDqBR7gutm57mjJ6oWfqr","challenge":"7d1196792909c55fc17734c36b7b1d501f44659e4a427157f05dcd30dadec","startMineTime":1580911043719,"endMineTime":1580911043773,"coinbaseTransactionHash":"7dfaa5ee7b5c2c4116fa72af53b95c1201aae3f3008f113222050edf6d483d9c","signatures":{}},"_id":"3194"}`


let block3191Entry = JSON.parse(Sblock3191)
let block3192Entry = JSON.parse(Sblock3192)
let block3193Entry = JSON.parse(Sblock3193)
let block3194Entry = JSON.parse(Sblock3194)

let block3191 = block3191Entry[block3191Entry._id]
let block3192 = block3192Entry[block3192Entry._id]
let block3193 = block3193Entry[block3193Entry._id]
let block3194 = block3194Entry[block3194Entry._id]

let branch = [ block3192, block3193, block3194, block3195, block3196, block3197, block3198, block3199]

openSocket(nodeAddress, async (socket)=>{
    socket.emit('testPush')
})