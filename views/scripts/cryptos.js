var output_ = null;
var debugOutput_ = null;
function getProperOutput(output, debugOutput){
  output_ = output;
  debugOutput_ = debugOutput;
}

function createCryptoTags(crypto){
  outputToDebug("<div class='currency-line'><span><b class='currency-symbol'>"+crypto+":  </b><b>BTC</b><b id='"+crypto+"-btc'> </b></span>" +
  " -- <span><b>USD</b><b id='"+crypto+"-us'> </b></span>" +
  " -- <span><b>CAD</b><b id='"+crypto+"-cad'> </b></span>" +
  " -- <span><b>EUR</b><b id='"+crypto+"-eur'> </b></span></div>");

}

function updateCryptoValues(cryptoName, cryptoData){
  let cryptoBTC = '#'+cryptoName+'-btc';
  let cryptoUS = '#'+cryptoName+'-us';
  let cryptoCAD = '#'+cryptoName+'-cad';
  let cryptoEUR = '#'+cryptoName+'-eur';

  let cryptoObj = {
    'btcValue':cryptoData.BTC,
    'usValue':cryptoData.USD,
    'cadValue':cryptoData.CAD,
    'eurValue':cryptoData.EUR
  };

  $(cryptoBTC).html(': '+cryptoData.BTC);
  $(cryptoUS).html(': '+cryptoData.USD);
  $(cryptoCAD).html(': '+cryptoData.CAD);
  $(cryptoEUR).html(': '+cryptoData.EUR);
}


function getSelectedCryptos(cryptoOne, cryptoTwo=false, cryptoThree=false,
  cryptoFour=false, cryptoFive=false, cryptoSix=false, cryptoSeven=false,
  cryptoEight=false, cryptoNine=false, cryptoTen=false){

  var crypto = {
    'btcValue':0,
    'usValue':0,
    'cadValue':0,
    'eurValue':0
  };
  createCryptoTags(cryptoOne);
  let cryptoValuesOne=crypto;
  if(cryptoTwo){ createCryptoTags(cryptoTwo); let cryptoValuesTwo=crypto; }
  if(cryptoThree){ createCryptoTags(cryptoThree); let cryptoValuesThree=crypto; }
  if(cryptoFour){ createCryptoTags(cryptoFour); let cryptoValuesFour=crypto; }
  if(cryptoFive){ createCryptoTags(cryptoFive); let cryptoValuesFive=crypto; }
  if(cryptoSix){ createCryptoTags(cryptoSix); let cryptoValuesSix=crypto; }
  if(cryptoSeven){ createCryptoTags(cryptoSeven); let cryptoValuesSeven=crypto; }
  if(cryptoEight){ createCryptoTags(cryptoEight); let cryptoValuesEight=crypto; }
  if(cryptoNine){ createCryptoTags(cryptoNine); let cryptoValuesNine=crypto; }
  if(cryptoTen){ createCryptoTags(cryptoTen); let cryptoValuesTen=crypto; }

  //https://min-api.cryptocompare.com/data/pricemulti?fsyms='+cryptoCurrency+'&tsyms=BTC,USD,EUR,CAD
  setInterval(function(){
    $.get('https://min-api.cryptocompare.com/data/pricemulti?fsyms='+cryptoOne+
    (cryptoTwo ? ','+cryptoTwo : '')+
    (cryptoThree ? ','+cryptoThree : '')+
    (cryptoFour ? ','+cryptoFour : '')+
    (cryptoFive ? ','+cryptoFive : '')+
    (cryptoSix ? ','+cryptoSix : '')+
    (cryptoSeven ? ','+cryptoSeven : '')+
    (cryptoEight ? ','+cryptoEight : '')+
    (cryptoNine ? ','+cryptoNine : '')+
    (cryptoTen ? ','+cryptoTen : '')+
    '&tsyms=BTC,USD,EUR,CAD',
    function(data){

      //blockchain.createTransaction(new Transaction('https://min-api.cryptocompare.com/data/pricemulti?fsyms=', '192.168.1.69', data[cryptoOne].USD, JSON.stringify(data)))
      console.log(data);
      sendTransaction('https://min-api.cryptocompare.com/data/pricemulti?fsyms=', null, data[cryptoOne].USD, JSON.stringify(data))

       updateCryptoValues(cryptoOne, data[cryptoOne]);
      (cryptoTwo ? updateCryptoValues(cryptoTwo, data[cryptoTwo]) : '');
      (cryptoThree ? updateCryptoValues(cryptoThree, data[cryptoThree]) : '');
      (cryptoFour ? updateCryptoValues(cryptoFour, data[cryptoFour]) : '');
      (cryptoFive ? updateCryptoValues(cryptoFive, data[cryptoFive]) : '');
      (cryptoSix ? updateCryptoValues(cryptoSix, data[cryptoSix]) : '');
      (cryptoSeven ? updateCryptoValues(cryptoSeven, data[cryptoSeven]) : '');
      (cryptoEight ? updateCryptoValues(cryptoEight, data[cryptoEight]) : '');
      (cryptoNine ? updateCryptoValues(cryptoNine, data[cryptoNine]) : '');
      (cryptoTen ? updateCryptoValues(cryptoTen, data[cryptoTen]) : '');

    })
  }, 15000);
}

function getListOfCryptos(){

  $.get('https://min-api.cryptocompare.com/data/all/coinlist', function(data){
    //console.log(data);
    var keys = Object.keys(data.Data);
    var cryptoData = data.Data;
    var keyName = '';

    output('<select id="soflow"></select>');
    keys.forEach(function(key){
        console.log(cryptoData[key].CoinName);
      var currencyName = cryptoData[key].FullName;
      keyName += "<option value="+key+">"+key+"  -  "+currencyName+"</option>";
    });
    $('select').html(keyName);
  })
}


function describeCrypto(cryptoName, toCurrency, aggrData=false){
  doCORSRequest({
    method: 'GET',
    url: 'cryptocompare.com/api/data/coinsnapshot/?fsym='+cryptoName+'&tsym='+toCurrency,
    data: ''
  }, function printResult(result) {
    console.log(result);
    listPropertiesOfCrypto(result, (aggrData? true: false));

  });
}

function listPropertiesOfCrypto(data, getAggregatedData=false){
  let keys = Object.keys(data.Data);
  let dataSet = data.Data;
  if(getAggregatedData){
    keys = Object.keys(data.Data.AggregatedData);
    dataSet = data.Data.AggregatedData;
  }

  for(let i=0;i<keys.length;i++){
    if(typeof dataSet[keys[i]] !='object'){
      output('<span>'+ keys[i] + ': ' + dataSet[keys[i]]+'</span>');
    }

  }
}

function loopThrough(keys, data){
  for(let i=0;i<keys.length;i++){
    if(typeof data[keys[i]] !='object'){
      output('<span>'+ keys[i] + ': ' + data[keys[i]]+'</span>');
    }

  }
}

function loopThroughBlockTransactions(keys, data){
  let blockTransactions = '';
  for(let i=0;i<keys.length;i++){
    if(typeof data[keys[i]] !='object'){
        blockTransactions += '<i>'+ keys[i] + ': ' + data[keys[i]]+'</i><br>';
    }

  }
  return blockTransactions;
}

function loopTransaction(transaction){
  if(transaction != undefined){
    var output = '';
    for (var property in transaction) {
      if(typeof transaction[property] != "object"){
        output += "    "+property + ': ' + transaction[property]+'<br>';
      }else{
        output += "    "+property + ': ' + JSON.stringify(transaction[property])+'<br>';
      }

    }
    return output;
  }

}



function loopThroughBlockchain(keys, blockData, expand=false){
  let blocks = '';
  let blockTransactions = '';
  for(let i=0;i<keys.length;i++){
    if(typeof blockData[keys[i]] !='object'){
      blocks += '<span class="block-info">'+ keys[i] + ': ' + blockData[keys[i]]+'</span><br/>';
    }
    else if(keys[i] == "transactions"){
      if(expand){
        blockTransacts = blockData[keys[i]];

        var transactHashes = Object.keys(blockTransacts);
        var transactIndex = 0;
        var currentTransact;


        for(hash in blockTransacts){
          transactIndex++;
          currentTransact = blockTransacts[hash];

          blockTransactions += "--------------------Transaction "+transactIndex+ "--------------------<br>"+loopTransaction(currentTransact) + "<br>";


        }


      }

    }

  }
  output("<div class='block-data'>"+blocks+"<br>"+(blockTransactions != ''? blockTransactions:"")+"</div>");
}


function loopThroughRecursive(keys, data){
  for(let i=0;i<keys.length;i++){
    if(typeof data[keys[i]] !='object'){
      keys = Object.keys(data[keys[i]]);
      data = data[keys[i]];
      arguments.callee(keys, data);
    }
    output('<span>'+ keys[i] + ': ' + data[keys[i]]+'</span>');
  }
}

function output(html) {
  output_.insertAdjacentHTML('beforeEnd', '<p>' + html + '</p>');
}

function outputToDebug(html){
  debugOutput_.insertAdjacentHTML('beforeEnd', '<p>' + html + '</p>');
}
