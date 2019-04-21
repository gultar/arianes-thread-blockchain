const fs = require('fs'); //Comment out in case of use in browser
let lines = [];

let hexText = '';
let hexTitle = '';
let firstTime = true;
//All the necessary tools to cast an I-Ching hexagram. Need to implement yarrow method
class Hexagram{
  constructor(){
    this.sixlines = [];
    this.bottomTrigramNumber = 0;
    this.topTrigramNumber = 0;
    this.hexagramNumber = 0;
    this.title = '';
    this.text = '';
    this.changingLines = [];
  }

  cast(){

  }

  //Flips a coin
  randomcoin() {
  /*  let side = (Math.random() < 0.5);*/
    var d=new Date();
    var side=Math.floor(((d.getMilliseconds()+d.getSeconds()+d.getMinutes()+d.getHours())*Math.random()) %2); //This is much closer to a random generator
    console.log(side);
    return (side);
  }

  //Casts a line using three coins method
  useThreeCoins(){
    let threeCoins = 0; //6 - 7 - 8 - 9
    let coinValue = 0;

    for(let i=0; i < 3; i++){
      if(this.randomcoin()){
        coinValue = 3; //----Yang Value----
      }
      else{
        coinValue = 2; //----Yin Value----
      }

      threeCoins += coinValue;
    }
    return threeCoins;
  }

  //Casts all six lines of the hexagram at once
  castSixLines(){
    for(let j=0; j < 6; j++){
      this.sixlines.push(this.useThreeCoins());
    }
  }

  //Casts a single line
  castALine(custom=false){ //to refactor
    if(lines.length < 6){
      lines.push(this.useThreeCoins());
    }
    else{
      this.sixlines = lines;
      console.log(this.sixlines);
    }
  }

  //Gives a text value to manually draw the hexagram figure. To be tested again
  drawLine(lineValue){
    var lineDrawn = "";
    switch(lineValue){
      case 6:
        lineDrawn = "-------&nbsp&nbsp&nbsp------- * ";
        break;
      case 7:
        lineDrawn = "----------------- ";
        break;
      case 8:
        lineDrawn = "-------&nbsp&nbsp&nbsp------- ";
        break;
      case 9:
        lineDrawn = "----------------- * ";
        break;
    }

    return lineDrawn;
  }

  //Isolates the trigram number using the three bottom and top line values to lookup the Hex number
  getTrigrams(sixlines){
    var trigramNbs = [ //--- All the possible trigrams
      "111",
      "100",
      "010",
      "001",
      "000",
      "011",
      "101",
      "110"
    ];
    let trigrams = "";
    let bottomTrigram = "";
    let topTrigram = "";
    let twoTrigramNumbers = [];
    let lines = sixlines;
    for(let i=0; i<6; i++){ //--- Formats the current trigram values into '1's and '0's
      if(this.sixlines[i]%2 !== 0){
        trigrams += "1";
      }
      else{
        trigrams += "0";
      }
    }

    bottomTrigram = trigrams.substring(0, 3);
    topTrigram = trigrams.substring(3, 6);

    twoTrigramNumbers = [trigramNbs.indexOf(bottomTrigram), trigramNbs.indexOf(topTrigram)];
    return twoTrigramNumbers;
  }

  setCustomLinesFromHexNumber(){

  }

  getChangingHex(){
    this.changinglines = this.sixlines;
    for(let i=0; i< this.sixlines.length; i++){
      switch(this.sixlines[i]){
        case 6:
          this.changingLines[i] = 7;
          break;
        case 9:
          this.changingLines[i] = 8;
          break;
        case 7:
        case 8:
          break;
      }
    }
  }

  //Looks up the hexagram number using the two trigrams. The order of trigram in the chart is by the order of King Wen's version
  getHexagramNumber(){
    let twoTrigramNumbers = this.getTrigrams();
    let bottomTrigramNb = twoTrigramNumbers[0];
    let topTrigramNb = twoTrigramNumbers[1];

    console.log("Bottom "+bottomTrigramNb);
    console.log("Top "+topTrigramNb);
    //First dimension = Bottom Trigram --- Second Dimension = Top Trigram
    var ichingHexagramTable = [ //--- Hexagram lookup table - King Wen's trigram order is used
      [1, 34, 5, 26, 11, 9, 14, 43],
      [25, 51, 3, 27, 24, 42, 21, 17],
      [6, 40, 29, 4, 7, 59, 64, 47],
      [33, 62, 39, 52, 15, 53, 56, 31],
      [12, 16, 8, 23, 2, 20, 35, 45],
      [44, 32, 48, 18, 46, 57, 50, 28],
      [13, 55, 63, 22, 36, 37, 30, 49],
      [10, 54, 60, 41, 19, 61, 39, 58]
    ];
    return ichingHexagramTable[bottomTrigramNb][topTrigramNb];
  }



  setTextAndTitle(){
    this.hexagramNumber = this.getHexagramNumber(this.hexagramNumber)
    fetchHexFromJSON(this.hexagramNumber, (hex) =>{
      this.title = hex.title;
      this.text = hex.text;
      console.log(this.title)
      console.log(this.text)
    })

  }
}

function fetchHexFromJSON(hexNumber, cb){
  var hex = {
    hexTitle : '',
    hexText : ''
  }

    fs.readFile('./iching.json', function(errRead, data){



      if(errRead){
        console.log(errRead);
      }

      try{
        iChing = JSON.parse(data);

        var hexNumberIndex = hexNumber - 1;

        hex.hexText = iChing.posts[hexNumberIndex].text;
        hex.hexTitle = iChing.posts[hexNumberIndex].title;
        cb(hex);
      }catch(e){
        console.log(e);
      }




  });

}

var myHex = new Hexagram();
myHex.castSixLines();
var num = myHex.getHexagramNumber(myHex.hexagramNumber);
fetchHexFromJSON(num, (hex)=>{
  console.log(hex);
});
