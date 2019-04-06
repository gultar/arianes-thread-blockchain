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



module.exports = { displayTime };
