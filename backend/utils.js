const sha256 = require('./sha256');
const merkle = require('merkle');

const displayTime = () =>{
  // var d = new Date(),   // Convert the passed timestamp to milliseconds
  //   year = d.getFullYear(),
  //   mnth = d.getMonth(),        // Months are zero based. Add leading 0.
  //   day = d.getDay(),                   // Add leading 0.
  //   hrs = d.getHours(),
  //   min = d.getMinutes(),
  //   sec = d.getSeconds(),               // Add leading 0.
  //   ampm = 'AM';

  //   return hrs+":"+min+":"+sec;
  let date = new Date();
  let time = date.toLocaleTimeString();
  return time;
}

const logger = (message, arg) => {
  let date = new Date();
  let time = date.toLocaleTimeString();
  let beautifulMessage = '['+ time +'] ' + message;
  if(arg){
    console.log(beautifulMessage, arg);
  }else{
    console.log(beautifulMessage);
  }
}


function RecalculateHash(block){

  return sha256(block.previousHash + block.timestamp + block.merkleRoot + block.nonce).toString();
}

function merkleRoot(dataSets){

  if(dataSets != undefined){
    var hashes = Object.keys(dataSets);


    let merkleRoot = merkle('sha256').sync(hashes);
    return merkleRoot.root();
  }

}



module.exports = { displayTime, logger, RecalculateHash, merkleRoot };
