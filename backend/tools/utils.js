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

  return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce + block.actionMerkleRoot).toString();
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

function loopOverMethods(object){
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

// function test(){
  
//   const RoutingTable = require('kademlia-routing-table')
// const { randomBytes } = require('crypto')
// function getId(value){
//   let address = value
//   if(!address){
//     address = Math.random().toString()
//   } 
//   let sha1 = require('sha1')
//   let id = sha1(address.toString())
//   return id
// }

// function getRandomIp(){
//   let address = new Array(4);
//   for(var i=0;i < address.length; i++){
//     address[i] = Math.floor(Math.random() * 255)
//   }
//   return address.join('.')
// }

// function getRandomPort(){
//   return Math.floor(Math.random() * 20000)
// }


// // Create a new table that stores nodes "close" to the passed in id.
// // The id should be uniformily distributed, ie a hash, random bytes etc.
// const table = new RoutingTable(sha1('150')) //randomBytes(32)
// // const jsonStr = `[{"id":"10","contact":{"address":"http://30.148.44.189:12531","port":12531}},
// // {"id":"11","contact":{"address":"http://17.74.149.176:6880","port":6880}},
// // {"id":"12","contact":{"address":"http://84.133.168.125:8839","port":8839}},
// // {"id":"13","contact":{"address":"http://57.119.155.81:1011","port":1011}},
// // {"id":"14","contact":{"address":"http://12.220.183.117:5334","port":5334}},
// // {"id":"15","contact":{"address":"http://225.206.126.120:11657","port":11657}},
// // {"id":"16","contact":{"address":"http://63.29.228.190:12306","port":12306}},
// // {"id":"17","contact":{"address":"http://124.126.0.33:2247","port":2247}},
// // {"id":"18","contact":{"address":"http://122.9.104.144:10732","port":10732}},
// // {"id":"19","contact":{"address":"http://200.75.67.31:10772","port":10772}}]
// // `
// // const json = JSON.parse(jsonStr)
// // json.forEach( line=>{
// //   line.id = getId(line.contact.address)
// //   table.add(line)
// // })

// for(var i=0; i < 100; i++){
//   let host = getRandomIp();
//   let port = getRandomPort();
//   let address = `http://${host}:${port}`;
//   let jsonstr = 
//   table.add({
//     id: getId(address),//getId(address),
//     contact:{
//       address:address,
//       port:port
//     }
//   })
// }
// // Add a node to the routing table
// // table.add({
// //   id: getId()//randomBytes(32), // this field is required
// //   // populate with any other data you want to store
// // })
 
// table.on('row', function (row) {
//   console.log('Row:', row)
//   // A new row has been added to the routing table
//   // This row represents row.index similar bits to the table.id
 
//   row.on('full', function (node) {
//     console.log('Full:',node)
//     // The row is full and cannot be split, so node cannot be added.
//     // If any of the nodes in the row are "worse", based on
//     // some application specific metric then we should remove
//     // the worst node from the row and re-add the node.
//   })
// })
 
// // Get the 20 nodes "closest" to a passed in id
                             
// const closest = table.closest('4000000000000000000000000000000000000000', 3)//randomBytes(32), 20)
// console.log(closest)
// // setTimeout(()=>{

// // })
// // table.rows.forEach( row=>{
// //   // console.log(row)
// //   row.nodes.forEach( node=>{
// //     console.log(node)
// //     console.log('*********')
// //   })
// // })
// // console.log(table.get('4b2256dd7c9496fb749f2ae722dad1ceab72be1c'))

// }

// test()

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

const validatePublicKey = (compressedPublicKey) =>{
  return new Promise((resolve, reject)=>{
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
  loopOverMethods, };
