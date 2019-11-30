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
//http://localhost:8080
var localAddress = document.URL;//"http://192.168.0.154:"+port;   //Crashes when there is no value. Need to reissue token //'192.168.0.154';// = new BlockchainAddress((ip?ip:"127.0.0.1"), 0, 0);
// getUserIP(function(ip){
//     localAddress = 'http://'+ip +':'+ port;
//     console.log('IP:', localAddress);
// });
console.log(port);
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
    "<span class'help-line'><b class='help-cmd'>joinnet</b> -------- Local node join the network by connecting to known nodes</span>",
    "<span class'help-line'><b class='help-cmd'>findpeers</b> ------ Broadcast a 'findpeer' event across network</span>",
    "<span class'help-line'><b class='help-cmd'>tx</b> ------------- Send transaction to another wallt. Usage tx fromAddr;toAddr;amount;optionalData </span>",
    "<span class'help-line'><b class='help-cmd'>background</b> ----- Changes the background image. Usage: background http://url.url</span>",
    "<span class'help-line'><b class='help-cmd'>show-blocks</b> ---- Displays all current blocks on the blockchain. Options: <b>-e or expand</b></span>",
    "<span class'help-line'><b class='help-cmd'>show-pending</b> --- Displays all pending transactions on blockchain. </span>",
    "<span class'help-line'><b class='help-cmd'>show-chain</b> ----- Displays a complete view of the blockchain object in the side panel. </span>",
    "<span class'help-line'><b class='help-cmd'>resolvefork</b> ---- Attempts to resolve a fork in blockchain. </span>",
    "<span class'help-line'><b class='help-cmd'>getpeers</b> ------- Queries connected node for its list of known peers. </span>",
    "<span class'help-line'><b class='help-cmd'>stopmine</b> ------- Stops current mining process. </span>",
    "<span class'help-line'><b class='help-cmd'>verbose</b> -------- Toggles verbose mode on and off. </span>",
    "<span class'help-line'><b class='help-cmd'>getmempool</b> ----- Queries connected node for its list of pending transactions. </span>",
    "<span class'help-line'><b class='help-cmd'>createwallet</b> --- Generates a new wallet to send and receive transactions. </span>"
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


  // function doCORSRequest(options, printResult, noJSON=false, callback=false) {
  //   var cors_api_url = 'https://cors-anywhere.herokuapp.com/';
  //   var x = new XMLHttpRequest();
  //   x.open(options.method, cors_api_url + options.url);
  //   x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  //   x.onload = x.onerror = function() {
  //     printResult((noJSON? x.responseText: JSON.parse(x.responseText)));
  //   }
  //   if (/^POST/i.test(options.method)) {
  //     x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  //   }
  //   x.send(options.data);
  //   if(callback){
  //     callback(x.responseText)
  //   }
  // }




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
        case 'update':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          output('Updating blockchain')
          runUpdate(args, cmd);
          break;
        case 'info':
          getInfo()
          break;
        case 'clear': runClear(args, cmd);
          break;
        case 'date': output( new Date() );
          break;
        case 'ls':
        case 'help': runHelp(args, cmd);
          break;
        case 'tx':
          if(!isConnected){
            connectError(cmd);
            break;
          }

          runSendTx(args, cmd)

          break;
        case 'txgen':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          output('Initiating transaction generator...');
          socket.emit('txgen')
          break;
        /*  Iching Reader and Hexagram Chart   */
        case 'iching': runIching(args, cmd);
          break;
        case 'background': $('body').css("background-image", "url("+args[0]+")")
          break;
        case 'f':
        case 'find':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          runFind(args, cmd);
          break;
        case 'mine':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          runMine(args, cmd);
          break;
        case 'stopmine':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          socket.emit('stopMining');
          break;
        case 'getpeers':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          fetchKnownPeers();
          break;
        case 'getmempool':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          fetchMempool();
          break;
        case 'verbose':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          runVerbose();
          break;
        case 'resolvefork':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          resolveFork();
          break;
        case 'show-blocks':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          runShowBlocks(args, cmd);
          break;
        case 'show-chain':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          $('#element').html("<pre>"+JSON.stringify(blockchain, null, 1)+"</pre>")
          break;
        case 'show-transact':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          runShowTransact();
          break;
        case 'show-public-keys':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          runShowPublicKeys();
          break;
        case 'createwallet':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          runCreateWallet(cmd, args);
          break;
        case 'walletcreate':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          createWalletWithRESTApi(cmd, args);
          break;
        case 'getwallet':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          getWalletByName(cmd, args);
          break;
        case 'loadwallet':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          loadWallet(cmd, args);
          break;
        case 'test':
          if(!isConnected){
            connectError(cmd);
            break;
          }
          socket.emit('getState', args[0])
          break;
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
          $('#myULContainer').html('');

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
        socket.emit('joinNetwork');
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
            socket.emit('connectionRequest', args[0]);
          }
        }
      }

      function runHelp(args, cmd){
        if(args.length == 0){
          output('<div class="ls-files">' + '<p>' +CMDS_.join('<br>')+ '</p>'+ '</div>');
        }else{
          if(cmds[args[0]]){
            output(cmds[args[0]]);
          }else{
            output("<span class'help-line'>Could not find help for command: "+args[0]+"</span>")
          }
          
        }
        
      }

      function runUpdate(args, cmd){
        if(args){
          socket.emit('update', args[0])
        }else{
          socket.emit('update');
        }
      }

      function runMine(cmd){
          socket.emit('startMiner');
      }


      function runSendTx(args, cmd){

        args = args.join(' ');

        if(args.indexOf(';') > -1){

          args = args.split(';');

          for(var i=0; i<args.length; i++){
            args[i] = args[i].trim()
          }

          if(args.length > 2){

            sendTx(args[0], args[1], args[2], args[3])
          }else{
            output('Please enter an <b>address to send to</b>, the <b>amount</b> and some <b>optional data</b>');
            output('All values are delimited by semi-colons like so: ')
            output('tx toAddr; amount; data')
          }
        }

      }

      function runVerbose(){
        
        socket.emit('verbose');
        socket.on('verboseToggled', (state)=>{
          if(state) output('Verbose ON');
          else output('Verbose OFF')
          socket.off('verboseToggled');
        })
        
      }

      function runCreateWallet(cmd, args){
        if(args[0]){
          output(`Creating wallet with name ${args[0]}`)
          socket.emit('createWallet', args[0])
          socket.on('walletCreated', (wallet)=>{
            if(wallet){
              output(`<pre>${JSON.stringify(wallet, null, 2)}</pre>`)
            }else{
              output('ERROR: Could not create wallet')
              console.log(wallet)
            }
            socket.off('walletCreated');
          })

          
        }else{
          output('ERROR: Wallet creation failed. No wallet name provided')
        }
      }

      function createWalletWithRESTApi(cmd, args){
        if(args[0]){
          $.ajax({
            type: "POST",
            url: localAddress+"createWallet",
        
            data: JSON.stringify({ 
              name: args[0] }),
            processData: true,
            contentType: "application/json; charset=utf-8",
            dataType: "json",
        
            error: function (xhr, status, error) {
                console.log(xhr.responseText);
                output("<pre>"+xhr.responseText+"</pre>")
            },
        
            success: function (msg) {
                console.log(msg);
                output(msg);
            }
        });
        }else{
          output('ERROR: Wallet creation failed. No wallet name provided')
        }
      }

      function getWalletByName(cmd, args){
        if(args[0]){
          $.get(localAddress+"getWalletPublicInfo", { name: args[0]} ,(response, status)=>{
            if(response){
              output(`Wallet:\n <pre>${JSON.stringify(response, null, 2)}</pre>`)
              console.log(response);
            }

            if(status !== 'success'){
              console.log('ERROR');
              console.log(error)
            }
          })
        }else{
          output('ERROR: Need to provide wallet name')
        }
      }

      function loadWallet(cmd, args){
        if(args[0]){
          $.get(localAddress+"loadWallet", { name: args[0]} ,(response, status)=>{
            if(response){
              output(`<pre>Wallet ${args[0]} loaded</pre>`)
              console.log(response);
            }

            if(status !== 'success'){
              console.log('ERROR');
              console.log(error)
            }
          })
        }else{
          output('ERROR: Need to provide wallet name')
        }
      }

      function sendTx(fromAddress, toAddress, amount, data=''){
        try{
          var transactToSend = {
            'sender' : fromAddress,
            'receiver' : toAddress,
            'amount' : amount,
            'data' : data
          }
  
          if(typeof transactToSend.amount == 'string'){
            transactToSend.amount = parseInt(transactToSend.amount);
          }
          var txL = JSON.stringify(transactToSend);
          $.ajax({
              type: "POST",
              url: localAddress+"transaction",
          
              data: txL,
              processData: true,
              contentType: "application/json; charset=utf-8",
              dataType: "json",
          
              error: function (xhr, status, error) {
                  console.log(xhr.responseText);
                  output("<pre>"+xhr.responseText+"</pre>")
              },
          
              success: function (msg) {
                  console.log(msg);
                  output(msg);
              }
          });
        }catch(e){
          console.log(e)
        }
        
    }

      function runIching(args, cmd){
		let hexNumber = 0;
		var myHex = new Hexagram();
        if(args[0]){
          if(args[0] == '-c' || args[0] == 'chart'){
            output('<img src="./images/trigramchart-clear.gif" alt="chart">');
			return;
          }
			hexNumber = args[0];
        }else{
			
			myHex.castSixLines();
			hexNumber = myHex.getHexagramNumber();
		}
		myHex.fetchHexFromJSON(hexNumber, (fetched)=>{
				if(fetched){
					drawIchingLines(myHex);
					$('output').append(myHex.title);
					$('output').append(myHex.text);
				}
		});
		
        
        
      }


    function runShowBlocks(args=false, cmd=false){
      output("<span class='output-header'>BLOCKCHAIN</span>"); //<br><hr>
      console.log(blockchain);
      for(var i=0; i<blockchain.chain.length; i++){
        var keys = Object.keys(blockchain.chain[i]);
        var data = blockchain.chain[i];
        if(args[0] == 'expand' || args[0] == '-e'){
          loopThroughBlockchain(keys, data, true);
        }else{
          loopThroughBlockchain(keys, data);
        }

      }
    }

    function runShowTransact(){
      var transIndex = 0;
      var transactionOutput = loopThroughBlockTransactions(keys,transaction);
      output('<div class="block-data">' + transactionOutput + '</div>');
    }


    }
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

      socket  = io(nodeAddress, {"transports" : ["websocket"], 'secure':true}  ); //{'query':{  token: JSON.stringify(endpointToken)  }}
      socket.heartbeatTimeout = 30000;
      //console.log(socket)

        socket.on('disconnect', function(){
          console.log('Node went offline');
          outputDebug('Node went offline');
          isConnected = false;

        })

        socket.on('connect', function(){
          console.log('Connected to node ', nodeAddress);
          setTimeout(()=>{
            // fetchBlockchainFromServer();
            isConnected = true;
          }, 2000)
        })

        socket.on('message', function(message){
          //console.log('NODE->', message);
          outputDebug('NODE-> '+message)
        })

        socket.on('nodeMessage', function(data){
          var message = data.message;
          var arg = data.arg;
          if(arg) {
            //console.log('NODE->'+message+" "+arg);
            outputDebug('NODE-> '+message+" "+arg);
          }else{
            //console.log('NODE->', message);
            outputDebug('NODE-> '+message);
          }

        })

  }, 2000)
}

function fetchKnownPeers(){
  socket.emit('getKnownPeers');
  console.log('Fetch list of known peers');
  output('Fetch list of known peers')
  socket.on('knownPeers', (peers)=>{
    var list = JSON.stringify(peers, null, 2);
    outputToDebug('<pre>'+list+'</pre>');
    socket.off('knownPeers')
  })
}

function fetchMempool(){
  socket.emit('getMempool');
  console.log('Fetching transaction mempool');
  output('Fetching transaction mempool');
  
  socket.on('mempool', (pool)=>{
    console.log(pool)
    output('<pre>'+JSON.stringify(pool, null, 2)+'</pre>');
    socket.off('mempool')
  })
}

function resolveFork(){
  socket.emit('resolveFork');
  output('Attempting to resolving blochain fork');
}


function fetchBlockchainFromServer(){

      socket.emit('getBlockchain', endpointToken);
      console.log('Fetching blockchain from server node...');
      socket.on('blockchain', function(data){
        if(fetchTrials <= 5){
          if(data == undefined){
            setTimeout(function(){
              console.log('blockchain not loaded correctly. Fetching again...');
              fetchTrials++;
              return fetchBlockchainFromServer();
            },2000)
          }
            blockchain = data;

            console.log('Fetched blockchain:',blockchain);
          fetchTrials = 0;

        }else{
          console.log('Tried to fetch from server 5 times. Server unavailable...');
            fetchTrials = 0;
        }

        socket.off('blockchain')

      });

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
    setInterval(function(){
      if($('#myULContainer').length >=30){
        
        $('#myULContainer').html('<div id="element"></div>'); 
      }
    },60000)
    
}

// function longestChain(localBlockchain=false, distantBlockchain=false){
//   var longestBlockchain;

//   if(distantBlockchain){
//     if(localBlockchain){
//       if(localBlockchain.chain.length >= distantBlockchain.chain.length){
//         longestBlockchain = localBlockchain;
//       }
//       else{
//         longestBlockchain = distantBlockchain;
//       }
//       return longestBlockchain;
//     }else{
//       //no localblockchain, revert to distant node's version
//       return distantBlockchain
//     }
//   }else{
//     //no distant blockchain, revert to local version
//     return localBlockchain;
//   }
// }

function getLatestBlock(blockchain){
  var lengthChain = blockchain.chain.length;
  return blockchain.chain[lengthChain - 1];
}

function createSecondTerminalInput(){
  // $('.prompt').html('[user@shell] # ');

  // Initialize a new terminal object
  var term = new Terminal('#input-line .cmdline', '#container output');
  term.init();
}