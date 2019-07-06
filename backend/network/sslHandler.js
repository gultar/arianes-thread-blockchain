const fs = require('fs')
const { readFile, writeToFile, logger } = require('../tools/utils')

class SSLHandler{
    constructor(){}

    getCertificateAndPrivateKey(){
        return new Promise(async (resolve)=>{
          
          fs.exists('./certificates/cert.pem', async (certExists)=>{
            if(!certExists) {
    
              let options = await this.createSSL();
              if(options){
                logger('Loaded SSL certificate and private key')
                resolve(options)
              }else{
                logger('ERROR: Could not generate certificate or private key')
                resolve(false)
              }
    
            }else{
              let certificate = await readFile('./certificates/cert.pem');
              if(certificate){
                
                let privateKey = await this.getSSLPrivateKey();
                if(privateKey){
                  let options = {
                    key:privateKey,
                    cert:certificate
                  }
                  logger('Loaded SSL certificate and private key')
                  resolve(options)
                }else{
                  logger('ERROR: Could not load SSL private key')
                  resolve(false)
                }
                
              }else{
                logger('ERROR: Could not load SSL certificate')
                resolve(false)
              }
    
            }
            
            
          })
        })
      }
    
      getSSLPrivateKey(){
        return new Promise(async(resolve)=>{
          fs.exists('./certificates/priv.pem', async(privExists)=>{
            if(!privExists) resolve(false)
            let key = await readFile('./certificates/priv.pem')
            if(key){
              resolve(key)
            }else{
              logger('ERROR: Could not load SSL private key')
              resolve(false)
            }
          })
        })
      }
    
      createSSL(){
        return new Promise(async (resolve)=>{
          let generate = require('self-signed')
          var pems = generate(null, {
            keySize: 1024, // defaults to 1024
            serial: '329485', // defaults to '01'
            expire: new Date('10 December 2100'), // defaults to one year from today
            pkcs7: false, // defaults to false, indicates whether to protect with PKCS#7
            alt: [] // default undefined, alternate names if array of objects/strings
          });
          logger('Created SSL certificate')
          let certWritten = await writeToFile(pems.cert, './certificates/cert.pem')
          let privKeyWritten = await writeToFile( pems.private, './certificates/priv.pem');
          let pubKeyWritten = await writeToFile(pems.public, './certificates/pub.pem');
    
          if(certWritten && privKeyWritten && pubKeyWritten){
            let options = {
              cert:pems.cert,
              key:pems.private
            }
            resolve(options)
          }else{
            resolve(false)
          }
        })
      }
    
    
}

module.exports = SSLHandler