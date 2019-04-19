// List of commands:
//     help
//     clear
//     date
//     echo
//     background
//     iching
//     connect
//     diconnect
//     joinnet
//     findpeers
//     tx
//     show-blocks 
//     show-chain 
//     resolvefork 
//     getpeers 
//     stopmine
//     verbose
//     getmempool

const cmds = {
    'clear':`<span class'help-line'><b class='help-cmd'>clear</b>: Clears the console</span><br/><br/>
      <span class'help-line'>Usage: clear --'option'</span><br/><br/>
      <span class'help-line'>--hard, -h to refresh the page and reset connect to node</span><br/>
      <span class'help-line'>--debug, -d to refresh side panel</span><br/>`,
    'date':"<span class'help-line'><b class='help-cmd'>date</b>: Displays the current date</span>",
    'echo':"<span class'help-line'><b class='help-cmd'>echo</b>: Outputs a string into the console. Usage: echo string. Ex: echo Hello World</span>",
    'help':"<span class'help-line'><b class='help-cmd'>help</b>: Displays this message or usage instructions for a specific command. Usage: help someCommand</span>",
    'background':"<span class'help-line'><b class='help-cmd'>background</b>: Changes the background image. Usage: background http://url.url.</span>",
    'iching':"<span class'help-line'><b class='help-cmd'>iching</b>: Casts a random hexagram and text. Usage: iching HxNb. Ex: iching 40</span>",
    //Nodes & Network commands
    'connect':`<span class'help-line'><b class='help-cmd'>connect</b>: Connects to local blockchain node</span><br/>
      <span class'help-line'>-!-Required for all blockchain related commands-!-</span>
      <span class'help-line'>Usage: connect http://peer.peer</span>`,
    'joinnet':"<span class'help-line'><b class='help-cmd'>joinnet</b>: Local node join the network by connecting to known nodes</span>",
    'findpeers':"<span class'help-line'><b class='help-cmd'>findpeers</b>: Broadcast a 'findpeer' event across network</span>",
    'tx':`<span class'help-line'><b class='help-cmd'>tx</b>: Send transaction to another wallet.</span><br/><br/>  
      <span class'help-line'>Usage: tx SenderAddress;ReceiverAddress;Amount;OptionalData<span><br/><br/>
      <span class'help-line'>All values are seperated by a semi-colon</span><br/>
      <span class'help-line'>Transactions can only be sent if sender address has loaded a valid wallet</span><br/>
      <span class'help-line'>Funds, signature and receiving address will be verified by network nodes before transaction is emitted</span><br/>
      <span class'help-line'>A receipt will be produced upon emission and will be stored in sender's wallet</span><br/>
      <span class'help-line'>Optional data will be sent as a string</span><br/>`,
    'show-blocks':"<span class'help-line'><b class='help-cmd'>show-blocks</b>: Displays all current blocks on the blockchain. Options: <b>-e or expand</b></span>",
    'show-chain':"<span class'help-line'><b class='help-cmd'>show-chain</b>: Displays a complete view of the blockchain object in the side panel. </span>",
    'resolvefork':`<span class'help-line'><b class='help-cmd'>resolvefork</b>: Attempts to resolve a fork in blockchain.</span><br/>
      <span class'help-line'><br/>Four cases might arise:<br/>Remote chain is longer by 1 or + blocks.<br/>---Local blockchain will orphan its conflicting blocks</span><br/>
      <span class'help-line'>Both chains are the same length but remote chain's latest block has more work.<br/>---Local blockchain will orphan its conflicting block</span><br/>
      <span class'help-line'>Both chains are the same length but local chain's latest block has more work.<br/>---No change will take place, remote node will be notified</span><br/>
      <span class'help-line'>Local blockchain has 1 or + blocks than remote peer's chain<br/>---No change will take place, remote node will be notified</span><br/>`,
    'getpeers':`<span class'help-line'><b class='help-cmd'>getpeers</b>: Queries connected node for its list of known peers.</span>`,
    'stopmine':`<span class'help-line'><b class='help-cmd'>stopmine</b>: Stops current mining process.</span>`,
    'verbose':`<span class'help-line'><b class='help-cmd'>verbose</b>: Toggles verbose mode on and off.</span>`,
    'getmempool':`<span class'help-line'><b class='help-cmd'>getmempool</b>: Queries connected node for its list of pending transactions.</span>`,

  
  }
