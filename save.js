const fs = require('fs')

const save = (config)=>{
  if(config){
    try{
      let configJson = JSON.stringify(config, null, 4);
      var wstream = fs.createWriteStream('./config/nodeconfig-'+config.port+'.json');
      wstream.write(configJson);
      wstream.end();
    }catch(e){
      console.log(e)
    }
  }else{
    console.log("ERROR: empty configs to be saved");
  }


}

module.exports = save;
