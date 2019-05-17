const sha256 = require('./sha256');
const merkle = require('merkle');
const fs = require('fs')
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';


const displayTime = () =>{
  let date = new Date();
  let time = date.toLocaleTimeString();
  return time;
}

const displayDate = (d) =>{
    var minutes = d.getMinutes().toString().length == 1 ? '0'+d.getMinutes() : d.getMinutes()
    var hours = d.getHours().toString().length == 1 ? '0'+d.getHours() : d.getHours()
    var ampm = d.getHours() >= 12 ? 'pm' : 'am'
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    var days = ['Sunday','Monday','Tuesday','Wedneday','Thursday','Friday','Saturday'];
    return days[d.getDay()]+' '+months[d.getMonth()]+' '+d.getDate()+' '+d.getFullYear()+' '+hours+':'+minutes+ampm;
}

const logger = (message, arg) => {
  let date = new Date();
  let time = date.toLocaleTimeString();
  let beautifulMessage = `[${time}] ${message}`//'['+ time +'] ' + message;
  if(arg){
    console.log(beautifulMessage, arg);
  }else{
    console.log(beautifulMessage);
  }
}


function RecalculateHash(block){

  return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce + block.actionMerkleRoot).toString();
}

function merkleRoot(dataSets){

  if(dataSets != undefined){
    var hashes = Object.keys(dataSets);


    let merkleRoot = merkle('sha256').sync(hashes);
    return merkleRoot.root();
  }

}

const encrypt = (text, password) =>{
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

const decrypt = (text, password) =>{
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

const readFile = async (filename) =>{
  return new Promise((resolve, reject)=>{
    fs.exists(filename,(exists)=>{
      if(exists){
        var data = '';
        var rstream = fs.createReadStream(filename);
    
        rstream.on('error', (err) =>{
          logger(err);
          reject(err)
        })
    
        rstream.on('data', (chunk) => {
          data += chunk;
        });
    
    
        rstream.on('close', () =>{  // done
          if(data != undefined){
              resolve(data);
          }else{
            resolve(false);
          }
        });
      }else{
        logger('ERROR: file does not exist')
        resolve(false);
      }
    })

  })
  
}

const writeToFile = (data, filename) =>{
  return new Promise((resolve, reject)=>{
    fs.exists(filename, async (exists)=>{
      
      if(exists){       
        let file = parseToString(data);
          if(file != undefined){

            var stream = fs.createWriteStream(filename);

            stream.write(file);
            stream.end();
            stream.on('finish', () => {
              resolve(true)
            });
            
            stream.on('error', (error) => {
              logger(error);
              reject(error)
            });

          }else{
            resolve(false)
          }
  
      }else{
        
        resolve(await createFile(data, filename))
      }
    });
  })

}

const createFile = (data, filename) =>{
  return new Promise((resolve, reject)=>{
    let file = parseToString(data);
    fs.exists(filename, async (exists)=>{
      if(!exists){
        var stream = fs.createWriteStream(filename);
        stream.write(file);
        stream.end()
        stream.on('finish', () => {
          resolve(true)
        });
        
        stream.on('error', (error) => {
          logger(error);
          reject(error)
        });
      }else{
        logger('WARNING: file already exists');
        resolve(await writeToFile(data, filename))
        
      }
    })
  })
  
}

const createTargetFile = (path)=>{
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  readline.question(`Enter node ip address: `, async (address) => {
    if(address && typeof address == 'string'){
      let success = await writeToFile(address, path);
      if(success){
        return true;
      }
    }
    readline.close();
    process.exit()  //DANGEROUS <-----
  })
}

const parseToString = (data)=>{
  let typeOfData = typeof data;
  let file = data;

  switch(typeOfData){
    case 'string':
      break;
    case 'function':
    case 'object':
      try{
        file = JSON.stringify(data, null, 2);
      }catch(e){
        console.log(e);
      }
      break;
    case 'number':
      file = data.toString();
      break;
    default:
      logger('ERROR: could not write this data type');
      break;

  }

  return file
}

const merge = (obj1 ,obj2 )=>{
  
    try{
      var obj3 = {};
      for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
      for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
      
      return obj3;
    }catch(e){
      console.log(e);
    }
  
}

function copyFile(source, target) {
  var rd = fs.createReadStream(source);
  var wr = fs.createWriteStream(target);
  return new Promise(function(resolve, reject) {
    rd.on('error', reject);
    wr.on('error', reject);
    wr.on('finish', resolve);
    rd.pipe(wr);
  }).catch(function(error) {
    rd.destroy();
    wr.end();
    throw error;
  });
}



module.exports = { 
  displayTime,
  displayDate,
  logger, 
  RecalculateHash, 
  merkleRoot, 
  encrypt, 
  decrypt,
  readFile,
  writeToFile,
  createFile,
  merge,
  createTargetFile };