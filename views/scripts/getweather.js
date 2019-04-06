//https://api.openweathermap.org/data/2.5/weather?q=${city},${country}&APPID=${APIKEY}&units=

//https://api.openweathermap.org/data/2.5/weather?q='+city+','+country+'&APPID='+APIKey+'&units=metric
//
//var request = new XMLHttpRequest();

const APIKey = "4fc135b0d0e5f9c15483bf34b463a5f8";
var city = "Quebec";
var country = "Canada";
var blockchainAddress = '192.168.1.69';
var weatherData = {};




function doCORSRequest(options, printResult) {
  var cors_api_url = 'https://cors-anywhere.herokuapp.com/';
  var x = new XMLHttpRequest();
  x.open(options.method, cors_api_url + options.url);
  x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  x.onload = x.onerror = function() {
    printResult(JSON.parse(x.responseText));
  }
  if (/^POST/i.test(options.method)) {
    x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  }
  x.send(options.data);
}


function sortDataObject(){
  var dataToBeReturned = '';

  fetchWeatherData();

  setTimeout(function(){
    dataToBeReturned = weatherData;
    //console.log(dataToBeReturned.main.temp);
    return dataToBeReturned;
  }, 10000);

  if(dataToBeReturned){

  }

}

function fetchWeatherData(city, country, forecast=false){

  let weatherUrl = 'https://api.openweathermap.org/data/2.5/weather?q='+city+','+country+'&appid='+APIKey+'&units=metric';
  if(forecast){
    weatherUrl = 'https://api.openweathermap.org/data/2.5/forecast?q='+city+','+country+'&appid='+APIKey+'&units=metric';
  }
  console.log(weatherUrl);
  doCORSRequest({
    method: 'GET',
    url: weatherUrl,
    data: ''
  }, function printResult(result) {
    console.log(result);
    if(forecast){
      console.log(result);
      $('#element').jsonView(result);
      // outputForecastData(result);
      return
    }
    outputWeatherData(result);
    //blockchain.createTransaction(new Transaction(weatherUrl, blockchainAddress, 0, result));
    sendTransaction(weatherUrl, clientConnectionToken.address, 0, result );
  });

}

function outputWeatherData(data){
  let keys = Object.keys(data.main);
  let mainDataSet = data.main;
  let weatherKeys = Object.keys(data.weather[0]);
  let windKeys = Object.keys(data.wind);
  let city = data.name;
  let country = data.sys.country;
  output('City: '+city+', '+country);
  output('#---------Temperature---------#');
  loopThrough(keys, mainDataSet);

  loopThrough(weatherKeys, data.weather[0]);
  output('#---------Wind---------#');
  loopThrough(windKeys, data.wind);
}

function outputForecastData(data){
  let currentDate = data.list[0].dt_txt;
  let activeForecastDate = currentDate;

  for(let i=0; i<data.list.length; i++){

    let keys = Object.keys(data.list[i]);
    let dataSet = data.list[i];
    let mainKeys = Object.keys(data.list[i].main);
    let mainDataSet = data.list[i].main;
    let weatherKeys = Object.keys(data.list[i].weather[0]);
    let weatherDataSet = data.list[i].weather[0];
    let windKeys = Object.keys(data.list[i].wind);
    let windDataSet = data.list[i].wind;
    let city = data.city.name;
    let country = data.city.country;
    let dateOfForecast = dataSet.dt_txt;

    if(CheckWhichDayItIs(dateOfForecast) != CheckWhichDayItIs(activeForecastDate)
     && CheckoutTimeUnit(dateOfForecast, 'hours') < 20 && CheckoutTimeUnit(dateOfForecast, 'hours') >= 8){
      output("Date: " + dateOfForecast);
      loopThroughBlockchain(mainKeys, mainDataSet);
      loopThroughBlockchain(weatherKeys, weatherDataSet);
      loopThroughBlockchain(windKeys, windDataSet);
      activeForecastDate = dateOfForecast;
    }
  }
}
