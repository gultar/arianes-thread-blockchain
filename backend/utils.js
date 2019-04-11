const displayTime = () =>{
  var d = new Date(),   // Convert the passed timestamp to milliseconds
    year = d.getFullYear(),
    mnth = d.getMonth(),        // Months are zero based. Add leading 0.
    day = d.getDay(),                   // Add leading 0.
    hrs = d.getHours(),
    min = d.getMinutes(),
    sec = d.getSeconds(),               // Add leading 0.
    ampm = 'AM';

    return hrs+":"+min+":"+sec;
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



module.exports = { displayTime, logger };
