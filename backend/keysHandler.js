const fs = require('fs');
const sha256 = require('./sha256');
const crypto = require('crypto'),
    algorithm = 'aes-256-ctr'
const cryptico = require('cryptico');
const base58 = require('base58');
const base64 = require('base-64');
var utf8 = require('utf8');
var childProcess = require('child_process');
const { exec } = require('child_process');

 		 //Need to implement a keywords topassword method, a bit like metamaskpassword = ;
//privateKey would be within local files. A key phrase like the one above
let password = '';
let createdPrivateKey = false;
let createdPublicKey = false;

// const loadPrivateKey = (cb) =>{
//   var callback = cb;
//   fs.exists('private.pem', (exists)=>{
//     if(exists){
//       var data = '';
//       var rstream = fs.createReadStream('private.pem');
//
//       rstream.on('error', (err) =>{
// 				console.log(err);
// 				return false;
//       })
//
// 			rstream.on('data', (chunk) => {
// 				data += chunk;
// 			});
//
//
// 			rstream.on('close', () =>{  // done
// 				if(data != undefined){
//           if(typeof callback == 'function'){
//             cb(data)
//           }else{
//             return false;
//           }
// 				}else{
// 					return false;
// 				}
// 			});
//
//     }else{
//       createPrivateKey();
//       return 'again';
//     }
//
//   })
// }
//
// const getPublicKey = (cb)=>{
//   readFile('public.pem').then((key, err)=>{
//     if(err) return err;
//     cb(key)
//   })
// }
//
// const loadPublicKey = (cb) =>{
//   var callback = cb;
//
//   fs.exists('public.pem', (exists)=>{
//     if(exists){
//       var data = '';
//       var rstream = fs.createReadStream('public.pem');
//
//       rstream.on('error', (err) =>{
//         console.log(err);
//         return false;
//       })
//
//       rstream.on('data', (chunk) => {
//         data += chunk;
//       });
//
//
//       rstream.on('close', () =>{  // done
//
//         if(data != undefined){
//
//           if(typeof callback == 'function'){
//
//             cb(data)
//           }else{
//             return false;
//           }
//
//
//         }else{
//           return false;
//         }
//
//       });
//     }else{
//       createPublicKey();
//       return 'again';
//     }
//
//   })
// }
//

//
// const createPrivateKey = ()=>{
//
//   generateEntropy();
//     exec('openssl genrsa -out private.pem -rand entropy.rand 1024', (err, stdout, output) => {
//       if (err) {
//         // node couldn't execute the command
//         console.log(err);
//         return;
//       }
//
//       // the *entire* stdout and stderr (buffered)
//       if(stdout){
//         console.log(`stdout: ${stdout}`);
//       }
//       if(output){
//         console.log(`${output}`);
//       }
//
//     });
//     setTimeout(()=>{
//       createPublicKey();
//     }, 1500)
//
//
// }
//
// const createPublicKey = () =>{
//
//   fs.exists('private.pem', (exists)=>{
//     if(exists){
//       exec('openssl rsa -in private.pem -pubout > public.pem', (err, stdout, output) => {
//         if (err) {
//           // node couldn't execute the command
//           console.log(err);
//           return false;
//         }
//
//         // the *entire* stdout and stderr (buffered)
//         if(stdout){
//           console.log(`stdout: ${stdout}`);
//           return true;
//         }
//         if(output){
//           console.log(`${output}`);
//           return true;
//         }
//
//       });
//     }else{
//       console.log('private.pem does not exist')
//       return false;
//     }
//
//   })
// }
//
//
//
// const getKeyPair = (cb)=>{
//   let keychain = {
//     privateKey:'',
//     publicKey:''
//   }
//   // console.log('Fetching keychain...')
//   try{
//     loadPrivateKey((privateKey)=>{
//
//       if(privateKey && privateKey != 'again'){
//         keychain.privateKey = privateKey
//
//       }
//
//       loadPublicKey((publicKey)=>{
//
//         if(publicKey && publicKey != 'again'){
//           keychain.publicKey = publicKey;
//           cb(keychain);
//         }
//
//       })
//     })
//
//
//
//
//   }catch(err){
//     console.log(err);
//   }
// }
const generateEntropy = () =>{
  var randomGen = '';
  for(var i=0; i<100; i++){
    var nonce = Math.floor(Date.now()*Math.random()*100*Math.random());
    nonce = nonce.toString();
    randomGen = randomGen.concat(nonce);

  }

  var wstream = fs.createWriteStream('entropy.rand');
  wstream.write(randomGen);
  wstream.end();
}

const createPrivateKey = ()=>{
 return new Promise(async (resolve, reject)=>{
   generateEntropy();
     exec('openssl genrsa -out private.pem -rand entropy.rand 1024', (err, stdout, output) => {
       if (err) {
         // node couldn't execute the command
         console.log(err)
         reject(false)
       }

       // the *entire* stdout and stderr (buffered)
       if(stdout){
         console.log(`stdout: ${stdout}`);
         resolve(true)
       }
       if(output){
         console.log(`${output}`);
         resolve(true)
       }

     });
 })

}

const createPublicKey = () =>{
  return new Promise((resolve, reject)=>{
    fs.exists('private.pem', (exists)=>{
      if(exists){
        exec('openssl rsa -in private.pem -pubout > public.pem', (err, stdout, output) => {
          if (err) {
            // node couldn't execute the command
            console.log(err)
            reject(false)
          }

          // the *entire* stdout and stderr (buffered)
          if(stdout){
            console.log(`stdout: ${stdout}`);
            resolve(true)
          }
          if(output){
            console.log(`${output}`);
            resolve(true)
          }

        });
      }else{
        console.log('private.pem does not exist')
        reject(false)
      }

    })
  })

}

const loadPublicKey = () =>{
  return new Promise((resolve, reject)=>{
    fs.exists('private.pem', (exists)=>{
      if(exists){
        try{
          var data = '';
          var rstream = fs.createReadStream('public.pem');

          rstream.on('error', (err) =>{
            console.log(err);
            reject(false)
          })

          rstream.on('data', (chunk) => {
            data += chunk;
          });


          rstream.on('close', () =>{  // done
            if(data != undefined){
                resolve(data)
            }else{
              reject(false)
            }
          });
        }catch(e){
          console.log(e)
        }

      }else{
        createPrivateKey();
        reject(false);
      }

    })
  })

}

const getPublicKey = async () =>{
  return new Promise(async (fetchResolve, fetchReject)=>{
  fs.exists('public.pem', async (exists)=>{
    if(exists){

        let publicKey = ''

          publicKey = await loadPublicKey();
          if(publicKey){
            fetchResolve(publicKey);   //Success!!!
          }else{
            console.log("ERROR: Couldn't fetch public key")
            fetchReject(false)
          }



    }else{

      fs.exists('private.pem', async (exists)=>{
        if(exists){
          createdPublicKey = await createPublicKey();
          if(createdPublicKey){
            publicKey = await loadPublicKey();
            if(publicKey){
              fetchResolve(publicKey);
            }else{
              console.log("ERROR: Couldn't fetch public key")
              fetchReject(false)
            }
          }

        }else{

          let createdPrivateKey = await createPrivateKey()
          if(createdPrivateKey){
            createdPublicKey = await createPublicKey();
            if(createdPublicKey){
              publicKey = await loadPublicKey();
              if(publicKey){
                fetchResolve(publicKey);
              }else{
                console.log("ERROR: Couldn't fetch public key")
                fetchReject(false)
              }
            }else{
              console.log("ERROR: Couldn't create public key")
              fetchReject(false)
            }
          }else{
            console.log("ERROR: Couldn't create private key")
            fetchReject(false)
          }
        }
      })
    }
  })


  })

}

// const run = async () =>{
//   getPublicKey()
//     .then((resolved, rejected)=>{
//       console.log(resolved);
//       console.log('REJECTED:', rejected)
//     })
//
// }
//
// run()



var testPassword = 'One ring to rule them all, one ring to find them, one ring to bring them and in the darkness bind them!';

const encrypt = (text, password=testPassword) =>{
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

const decrypt = (text, password=testPassword) =>{
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}





module.exports = { encrypt, decrypt, getPublicKey }
