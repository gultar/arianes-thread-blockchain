const sha256 = require('./sha256');
const crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
 		password = (sha256('One ring to rule them all, One ring to find them, One ring to bring them all, and in the darkness bind them ')).toString(); //Need to implement a keywords to password method, a bit like metamask
//Password would be within local files. A key phrase like the one above


function encrypt(text){
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

function decrypt(text){
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

module.exports = { encrypt, decrypt }

// var hw = encrypt("hello world")
// // outputs hello world
// console.log(decrypt(hw));
