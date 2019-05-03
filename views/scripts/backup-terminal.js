var cryptos = [{}];

//////////////////////////////////////////////////////////////
/////////////////////BLOCKCHAIN CONTAINER/////////////////////
//////////////////////////////////////////////////////////////
var blockchain;
//////////////////////////////////////////////////////////////

 const nodeAddresses = ['http://169.254.139.53:8080', 'http://169.254.139.53:8081', 'http://169.254.139.53:8082', 'http://192.168.0.153:8080', 'http://192.168.0.153:8081', 'http://192.168.0.153:8082',
  'http://192.168.0.112:8080', 'http://192.168.0.112:8080', 'http://192.168.1.68:8080', 'http://192.168.0.154:8080', 'http://192.168.1.75:8080']

//List of IP addresses for fallback connections if current connectionfails

//speaks for itself. Used to output which connection we're using
var url = document.URL;

//port of client connection
var port = 8080;
var localAddress = document.URL;
var currentTime = Date.now();
//This is a counter to limit the number of attempts to try to fetch blockchain from file if unreadable or else
var fetchTrials = 0;
var sendingTrials = 0;
var fallbackCounter = -1;
var isConnected = false;
var outputBuffer;

//Initiating the client token for connecting to network
var endpointToken;

//Container for hexagrams to be sent to screen
var hexagrams = [{}];

//container for background image
var backgroundUrl = $('body').css("background-image");

//container for DOM element that represents the seccond right hand side console on application
var debugOutput_ = document.getElementById('second-container');
var consolePanel = document.getElementById("console-panel");
var entryIndex = 0;
//Server connection
var socket;

//Transaction Generator setInterval
var txGen;

function fireKey(el,key)
{
    if(document.createEventObject)
    {

        var eventObj = document.createEventObject();
        eventObj.keyCode = key;
        el.fireEvent("onkeydown", eventObj);
        eventObj.keyCode = key;
    }else if(document.createEvent)
    {

        var eventObj = document.createEvent("Events");
        eventObj.initEvent("keydown", true, true);
        eventObj.which = key;
        eventObj.keyCode = key;

        el.dispatchEvent(eventObj);
    }
}

var Terminal = Terminal || function(cmdLineContainer, outputContainer) {
  window.URL = window.URL || window.webkitURL;
  window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

  var cmdLine_ = document.querySelector(cmdLineContainer);
  var output_ = document.querySelector(outputContainer);

  var mobileButton = document.getElementById('mobile-enter');
  var ulContainer = document.getElementById("myULContainer")

  var fs_ = null;
  var cwd_ = null;
  var history_ = [];
  var histpos_ = 0;
  var histtemp_ = 0;


  const CMDS_ = [
    "<span class'help-line'><b class='help-cmd'>clear</b> ---------- Clears the console</span>",
    "<span class'help-line'><b class='help-cmd'>date</b> ----------- Displays the current date</span>",
    "<span class'help-line'><b class='help-cmd'>echo</b> ----------- Outputs a string into the console. Usage: echo string. Ex: echo Hello World</span>",
    "<span class'help-line'><b class='help-cmd'>help</b> ----------- Displays this message</span>",
    "<span class'help-line'><b class='help-cmd'>iching</b> --------- Casts a random hexagram and text. Usage: iching HxNb. Ex: iching 40</span>",
    "<span class'help-line'><b class='help-cmd'>connect</b> -------- Connects to local blockchain node. Required for all blockchain related commands</span>",
    "<span class'help-line'><b class='help-cmd'>disconnect</b> -------- Disconnects from the blockchain node. </span>",
    "<span class'help-line'><b class='help-cmd'>disconnect</b> -------- Ask the node to join the network. </span>",
    "<span class'help-line'><b class='help-cmd'>background</b> ----- Changes the background image. Usage: background URL. Ex: background http://www.nafpaktia.com/data/wallpapers/40/860159.jpg</span>"
  ];



  //Refocuses on input line
  window.addEventListener('click', function(e) {
    cmdLine_.focus();
  }, false);

  //Keyboard handler
  cmdLine_.addEventListener('click', inputTextClick_, false);
  cmdLine_.addEventListener('keydown', historyHandler_, false);
  cmdLine_.addEventListener('keydown', processNewCommand_, false);
  mobileButton.addEventListener('click',
    function(){
      var keyboardEvent = document.createEvent("KeyboardEvent");

      fireKey(cmdLine_, 13);
    }
  , false);
  //
  function inputTextClick_(e) {
    this.value = this.value;
  }


  function historyHandler_(e) {
    if (history_.length) {
      if (e.keyCode == 38 || e.keyCode == 40) { //event keycode up or down on keyboard
        if (history_[histpos_]) {
          history_[histpos_] = this.value;
        } else {
          histtemp_ = this.value;
        }
      }

      if (e.keyCode == 38) { // up
        histpos_--;
        if (histpos_ < 0) {
          histpos_ = 0;
        }
      } else if (e.keyCode == 40) { // down
        histpos_++;
        if (histpos_ > history_.length) {
          histpos_ = history_.length;
        }
      }

      if (e.keyCode == 38 || e.keyCode == 40) {
        this.value = history_[histpos_] ? history_[histpos_] : histtemp_;
        this.value = this.value; // Sets cursor to end of input.
      }
    }
  }

  //Outputs the manual line drawing made in the Hexagram class
  function drawIchingLines(myHex){
    for(var i=myHex.sixlines.length; i>=0; i--){
      output(myHex.drawLine(myHex.sixlines[i]));
    }
  }


  function doCORSRequest(options, printResult, noJSON=false, callback=false) {
    var cors_api_url = 'https://cors-anywhere.herokuapp.com/';
    var x = new XMLHttpRequest();
    x.open(options.method, cors_api_url + options.url);
    x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    x.onload = x.onerror = function() {
      printResult((noJSON? x.responseText: JSON.parse(x.responseText)));
    }
    if (/^POST/i.test(options.method)) {
      x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    x.send(options.data);
    if(callback){
      callback(x.responseText)
    }
  }




  function validateArgs(cmd){
    if (cmd && cmd.trim()) {
      var args = cmd.split(' ').filter(function(val, i) {
        return val;
      });
      var cmd = args[0].toLowerCase();
      args = args.splice(1); // Remove cmd from arg list.
      console.log(args);

      return args;
    }
  }

  //Core of commands processing
  function processNewCommand_(e) {

    if (e.keyCode == 9) { // tab
      e.preventDefault();
      // Implement tab suggest.
    } else if (e.keyCode == 13) { // enter
      // Save shell history.
      if (this.value) {
        history_[history_.length] = this.value;
        histpos_ = history_.length;
      }

      // Duplicate current input and append to output section.
      var line = this.parentNode.parentNode.cloneNode(true);

      line.removeAttribute('id')
      line.classList.add('line');
      var input = line.querySelector('input.cmdline');
      input.autofocus = false;
      input.readOnly = true;
      output_.appendChild(line);

      if (this.value && this.value.trim()) {
        var args = this.value.split(' ').filter(function(val, i) {
          return val;
        });
        var cmd = args[0].toLowerCase();
        args = args.splice(1); // Remove cmd from arg list.
      }

      switch (cmd) {
        case 'start':
          startServer();
          break;
        case 'c':
        case 'con':
        case 'connect':
          connect(args, cmd);
          break;
        case 'd':
        case 'dec':
        case 'disconnect':
          disconnect(args, cmd);
          break;
        case 'r':
        case 'rec':
        case 'reconnect':
          disconnect(args, cmd);
          connect(args, cmd);
          break;
        case 'j':
        case 'join':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          joinNetwork(args, cmd);
          break;
        case 'leave':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          leaveNetwork(args, cmd);
          break;

        case 'goto': openInNewTab(args[0]);
          break;
        case 'clear': runClear(args, cmd);
          break;
        case 'date': output( new Date() );
          break;
        case 'ls':
        case 'help': output('<div class="ls-files">' + '<p>' +CMDS_.join('<br>')+ '</p>'+ '</div>');
          break;
        /*  Iching Reader and Hexagram Chart   */
        case 'iching': runIching(args, cmd);
          break;
        case 'background': $('body').css("background-image", "url("+args[0]+")")
          break;
        case 'msg':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          var message = args.join(' ');
          socket.emit('broadcastMessage', message);
          break

        default:
          if (cmd) {
            output(cmd + ': command not found');
          }
      };

      window.scrollTo(0, getDocHeight_());
      this.value = ''; // Clear/setup line for next input.

      function runClear(args, cmd){
        if(args[0] == '-h' || args[0] == 'hard'){
          window.location.reload(true);
        }
        if(args[0] == 'debug' || args[0] =='-d'){
          $('#myULContainer').html('<div id="element"></div>');

        }
          $('output').html('');
          clearAll();
          $('#myCanvas').css('visibility', 'hidden');
          initTerminalMsg();

      }


      function connect(args, cmd){
        if(args.length > 0){
          try{

            localAddress = args[0]
            output('Connecting to node '+localAddress)
            initSocketConnection();
          }catch(err){
            output(err);
          }

        }else{
          output('Connecting to local node at address '+localAddress)
          initSocketConnection();
        }

      }

      function joinNetwork(args, cmd){
        socket.emit('joinNetwork', endpointToken);
      }

      function leaveNetwork(args, cmd){
        socket.emit('leaveNetwork', endpointToken);
      }

      function disconnect(args, cmd){
        if(socket){
          isConnected = false;
          socket.emit('close', endpointToken);
          setTimeout(function(){
            socket.destroy();
          }, 2000)
          if(txGen){
            window.clearInterval(txGen);
            txGen = null;
          }
          outputDebug('Disconnected from node');
          console.log("Cleared active connection");
        }
      }

      function runFind(args, cmd){
        if(args.length > 0){
          if(typeof args[0] == 'string'){
            socket.emit('firstContact', args[0]);
          }
        }
      }




      function runIching(args, cmd){
        if(args[0]){
          if(args[0] == '-c' || args[0] == 'chart'){
            output('<img src="./images/trigramchart-clear.gif" alt="chart">');
          }else{
            var myHex = new Hexagram();
            fetchHexFromFireBase(args[0]);
            myHex.setTextAndTitle();
            //blockchain.createTransaction(new Transaction('blockchain', '192.168.1.69', 0, myHex));
            drawIchingLines(myHex);
          }

          return;
        }
        var myHex = new Hexagram();
        myHex.castSixLines();
        fetchHexFromFireBase(myHex.getHexagramNumber());
        myHex.setTextAndTitle();
        drawIchingLines(myHex);
      }


  function connectError(cmd){
    output('Client is not connected to node. Cannot run command <b>'+ cmd+'</b>');
    output('Try starting the node first, then if the error persists');
    output('Try fetching the blockchain from the node again ');
  }

  function output(html) {
    output_.insertAdjacentHTML('beforeEnd', '<p>' + html + '</p>');
    cmdLine_.focus();
  }



  function outputTd(html) {
    output_.insertAdjacentHTML('beforeEnd', '<td>' + html + '</td>');
  }



  function initTerminalMsg(){

    output('<div id="date">' + new Date() + '</div><p>Enter "help" for more information.</p>');
    setInterval(function(){
      $('#date').html(new Date());
    }, 1000)
  }

  // Cross-browser impl to get document's height.
  function getDocHeight_() {
    var d = document;

    return Math.max(
        Math.max(d.body.scrollHeight, d.documentElement.scrollHeight),
        Math.max(d.body.offsetHeight, d.documentElement.offsetHeight),
        Math.max(d.body.clientHeight, d.documentElement.clientHeight)
    );
  }

  //
  return {
    init: function() {
      initTerminalMsg();

      getProperOutput(output_, ulContainer);
    },
    output: output,
    outputDebug: outputDebug
  }
};

function outputDebug(html) {

  debugOutput_.insertAdjacentHTML('beforeEnd', '<p id=entry'+entryIndex+'>' + html + '</p>');
  consolePanel.scrollTop = consolePanel.scrollHeight;

}








function initSocketConnection(nodeAddress){
setTimeout(function(){

  if(!nodeAddress){
    nodeAddress = localAddress;
  }

  issueClientToken(nodeAddress);

    socket  = io(nodeAddress ); //{'query':{  token: JSON.stringify(endpointToken)  }}
    socket.heartbeatTimeout = 30000;

      socket.on('disconnect', function(){
        console.log('Node went offline');
        outputDebug('Node went offline');
        isConnected = false;

      })

      socket.on('connect', function(){
        console.log('Connected to node ', nodeAddress);

      })

      socket.on('message', function(message){
        console.log('NODE->', message);
        outputDebug('NODE-> '+message)
      })

}, 2000)


}

function clearAll() {
  for (var i = setTimeout(function() {}, 0); i > 0; i--) {
    window.clearInterval(i);
    window.clearTimeout(i);
    if (window.cancelAnimationFrame) window.cancelAnimationFrame(i);
  }
}


window.onbeforeunload = function() {
    clearAll();
    localStorage.setItem('savedBackground', $('body').css("background-image"));
    //saving the blockchain to server, then to file
    if(socket){
      socket.emit('close', endpointToken);
      socket.destroy();
    }

    // saveBlockchainToServer();

}

window.onload = function() {

    $('#myCanvas').css('visibility', 'hidden');
    $('body').css("background-image", localStorage.getItem('savedBackground'));
}


function createSecondTerminalInput(){
  // $('.prompt').html('[user@shell] # ');

  // Initialize a new terminal object
  var term = new Terminal('#input-line .cmdline', '#container output');
  term.init();
}
