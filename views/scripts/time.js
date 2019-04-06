function CheckWhichDayItIs(date){
  var d = new Date(date),	// Convert the passed timestamp to milliseconds
    yyyy = d.getFullYear(),
    mm = d.getMonth(),	// Months are zero based. Add leading 0.
    dd = d.getDay(),			// Add leading 0.
    hh = d.getHours(),
    h = d.getHours(),
    min = d.getSeconds(),		// Add leading 0.
    ampm = 'AM';

    return dd;

}

function CheckoutTimeUnit(date, unit){
  var d = new Date(date)

  switch((unit).toLowerCase()){
    case 'y':
    case 'year':
    case 'yyyy':
       return d.getFullYear();

    case 'm':
    case 'month':
    case 'mm':
      return d.getMonth();

    case 'd':
    case 'day':
    case 'dd':
      return d.getDay();

    case 'h':
    case 'hour':
    case 'hours':
    case 'hh':
      return d.getHours();

    case 'm':
    case 'minute':
    case 'minutes':
    case 'mm':
      return d.getMinutes();

    case 's':
    case 'second':
    case 'seconds':
    case 'ss':
      return d.getSeconds();

  }
}
