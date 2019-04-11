const log = (message, arg) =>{
    let ID = this.id.slice(0, 10);
    let date = new Date();
    let time = date.toLocaleTimeString();
    let beautifulMessage = '['+ID+'] - '+ time +' ' + message;
    if(arg){
      console.log(beautifulMessage, arg);
    }else{
      console.log(beautifulMessage);
    }
}

module.export = log;