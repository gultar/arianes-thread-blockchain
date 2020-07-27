const sha256 = require('./sha256');
const merkle = require('merkle');
const fs = require('fs');
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';
const ECDSA = require('ecdsa-secp256r1');

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
  if(!process.SILENT){
    let date = new Date();
    let time = date.toLocaleTimeString();
    let beautifulMessage = `[${time}] ${message}`//'['+ time +'] ' + message;
    if(arg){
      console.log(beautifulMessage, arg);
    }else{
      console.log(beautifulMessage);
    }
  }
  
}



function RecalculateHash(block){

  return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce + block.actionMerkleRoot ).toString();
}

function merkleRoot(dataSet){

  if(typeof dataSet == 'object'){
    var hashes = Object.keys(dataSet);
    let merkleTree = merkle('sha256').sync(hashes);
    return merkleTree.root();
  }else{
    return false;
  }

}

function getMethodNames(object){
  return new Promise((resolve)=>{
    let methods = []
    for (let name of Object.getOwnPropertyNames(Object.getPrototypeOf(object))) {
      
      let method = name;
      if(method !== 'constructor'){
        methods.push(method)
      }else{
        continue
      }
      
    }
    resolve(methods)
  })
  
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
        logger(`ERROR: file ${filename} does not exist`)
        resolve(false);
      }
    })

  })
  
}

const getCPUPercent = () =>{
  'use strict'

  // see: https://github.com/nodejs/node/pull/6157

  var startTime  = process.hrtime()
  var startUsage = process.cpuUsage()

  // spin the CPU for 500 milliseconds
  var now = Date.now()
  while (Date.now() - now < 500)

  var elapTime = process.hrtime(startTime)
  var elapUsage = process.cpuUsage(startUsage)

  var elapTimeMS = secNSec2ms(elapTime)
  var elapUserMS = secNSec2ms(elapUsage.user)
  var elapSystMS = secNSec2ms(elapUsage.system)
  var cpuPercent = Math.round(100 * (elapUserMS + elapSystMS) / elapTimeMS)

  return {
    elapTimeMS:elapTimeMS,
    elapUserMS:elapUserMS,
    elapSystMS:elapSystMS,
    cpuPercent:cpuPercent
  }

  function secNSec2ms (secNSec) {
    return secNSec[0] * 1000 + secNSec[1] / 1000000
  }
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

const createDirectoryIfNotExisting = (pathToFolder)=>{
 return new Promise((resolve)=>{
  if(pathToFolder){
    fs.mkdirSync(pathToFolder, { recursive: true }, (error)=>{
      if(error){
        resolve({ exists:true })
      }else{
        resolve({ created:true })
      }
    })
 }else{
  resolve(false)
 }
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
      throw new Error('ERROR: could not write this data type')
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

const getDirectorySize = ()=>{
  return new Promise((resolve)=>{
    const getSize = require('get-folder-size');
 
    getSize('./data/quicknet/StorageStorage/', (err, size) => {
      if (err) { resolve({error:err}) }
    
      resolve(size)
    });
  })
}

const validatePublicKey = (compressedPublicKey) =>{
  return new Promise((resolve, reject)=>{
      try{
        if(compressedPublicKey){
          try{
            const publicKey = ECDSA.fromCompressedPublicKey(compressedPublicKey);
            if(publicKey){
              resolve(true)
            }else{
              resolve(false)
            }
            
          }catch(e){
            resolve(false)
          }
        }else{
          resolve(false);
        }
      }catch(err){
        resolve(false);
      }

  })
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
  createTargetFile,
  validatePublicKey,
  getMethodNames,
  getCPUPercent,
  createDirectoryIfNotExisting,
  getDirectorySize };
