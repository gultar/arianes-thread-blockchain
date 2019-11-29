# Thousandfold blocks

A Nodejs + Socket.io + PouchDB blockchain platform with signed transactions, p2p communication, block synchronization between peers, block conflict resolution (although still pretty simple), a working proof of work algorithm, a difficulty increase algorithm.



Aside from some fine tuning, here are some possible future implementations:
- A proof of stake version of the same project.
- TCP NAT traversal to do a live test

### Prerequisites

- Node.js (latest version)

## Getting Started

You need to clone the repo in a folder

```
git clone https://github.com/gultar/blockchain-simulation
cd ./blockchain-simulation
```
Then you need to install Node.js

```
$ curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
$ sudo apt-get install -y nodejs
```

To get the blockchain up and running you first need to get all the dependencies

```
npm install
```
### Configuring the blockchain

Almost all configurations for the generation of blocks are found in the
./config/genesis.json. 

You can set the balances of your account for the ICO.
Other configurations like block times, initial/minimum difficulty and much more 
can be set in this file.

You can then set your node's network configs at
./config/nodeconfig.json


### Connecting to the blockchain

Then you can either instantiate the class by using

```
let myNode = new Node({
        host: configs.host,
        port: configs.port,
        verbose: configs.verbose,
        httpsEnabled: true, -> Is set by default
        enableLocalPeerDiscovery: discovery.local,
        enableDHTDiscovery: discovery.dht,
        peerDiscoveryPort: parseInt(configs.port) - 2000,
        networkChannel: 'blockchain-mainnet',
        noLocalhost: true,
        genesis: genesis
      })


let started = await myNode.startServer()
if(started.error) throw new Error(started.error)

myNode.joinPeers();

```

or by running blockchainCLI.js for a CLI-like interface.

```
node blockchainCLI.js start <options>
```

To get a list of all options :
```
$ node blockchainCLI.js --help
Usage: blockchainCLI <value> [-options]


  Possible other commands:

  wallet - For managing wallets and wallet states
  sendTx - For sending transactions from one wallet to another
  action - For creating and sending an action to a contract
  chain  - For querying the blockchain for information
  config - For updating node config file
  pool   - For managing transaction pool


Options:
  -V, --version                     output the version number
  -n, --hostname <hostname>         Specify node hostname
  -p, --port <port>                 Specify node port
  -j, --join [network]              Joins network
  -s, --seed <seed>                 Seed nodes to initiate p2p. Ex: '127.0.0.1:1000;127.0.0.1:1001;127.0.0.1:1002'
  -v, --verbose                     Enable transaction and network verbose
  -d, --peerDiscovery [type]        Enable peer discovery using various methods
  -t, --peerDiscoveryPort <port>    Enable peer discovery using various methods
  -l, --dhtDisconnectDelay <delay>  Length of time after which the node disconnects from dht network
  -h, --help                        output usage information


Commands:
  start                 Starts blockchain node
  create                Creates the genesis block
  rollback <blockNum>   Rollback blocks from chain (from the end) 


```

## Sending a transaction

In order to send a transaction, you may either use the CLI tool or send a signed JSON data packet to your local blockchain node.

The basic structure of a transaction is as follows:

```

{ 
  fromAddress: <ECDSA Public key OR Account name>,
  toAddress: <ECDSA Public key OR Account name>,
  type: <Type of transaction>,
  data: <Extra data to send along>,
  timestamp: <UNIX timestamp>,
  amount: <Amount>,
  hash: <SHA256 hash of the transaction>,
  miningFee: <Enough mining fee to equate size of transaction>,
  signature: <ECDSA Signature from a private key> 
}

```

## Interacting with smart contracts
There are two ways to use contracts: Actions and Transaction calls. To build those, you can either use the CLI tools provided for that purpose or manually send the data to your local node. 

### Actions

Actions are usually less expensive than transaction calls because they do not get mined straight away but are instead added to a block after transactions. Simply put, transaction calls trigger mining but actions don't. Action would then be more suited for non urgent or less operation-critical interactions with contracts. 

```
{
    fromAccount: <Sending account name>,
    type: <Type of action>,
    task: <Selected task to perform according to type>,
    data: { //Data payload contains sending account details
      name: <Sending account name>,
      ownerKey: <ECDSA Public Key of Owner Wallet>,
      hash: <SHA256 Hash>,
      ownerSignature: <Signature>,
      type: <>
    },
    timestamp: <Unix Timestamp>,
    contractRef: {},
    fee: <Enough mining fee to equate size of transaction>,
    hash: <SHA256 hash of the action>,
    signature: <ECDSA signature of the hash from a private key>

}


```



### Transaction Calls

By sending a transaction of type <call> you may interact with smart contracts stored on the blockchain
The basic structure of the data payload must be consistent in order for the transaction to be
validated by other nodes. Here is an example of the data payload located in the data field in the transaction:

```
{
  'method':'contractMethod',
  'params':{
    'key':'value'
  }
}
```

Here is the structure of a transaction call:


```
{ 
  fromAddress: <Sending account name>,
  toAddress: <Account name of the Contract>,
  type: 'call',
  data: {
    'method':<Contract method>,
    'params':{
      <Additional Parameters as Key:Value pair>
    }
  },
  timestamp: <UNIX timestamp>,
  amount: <Amount>,
  hash: <SHA256 hash of the transaction>,
  miningFee: <Enough mining fee to equate size of transaction>,
  signature: <ECDSA Signature from your private key> 
}

```

Here is an example:

```
 receipt: {
    fromAddress: 'tuor',   //Name of the sending account
    toAddress: 'Token',   //Name of the Contract
    type: 'call',         //Type of transaction
    data: { 
      method: 'issue',    //Method to be called from the contract
      params: {
        "symbol":"GOLD",    
        "amount":100,
        "receiver":"turgon"
      } 
    },
    timestamp: 1574788012061,
    hash: '1c853838aca7279141e38613726ed1d26cf97da1a91c1c57cadb59b4e46304bc',
    miningFee: 0.0167,
    signature: 'hkNKNUdT4DnbDVRKaodVg8wYEjkRHSzcMjLyRL/5k1KgDWhcxLolm7vjBEXlnu7A
ckL7qrOkdhXgxSxHVTLHow=='
  }


```

## Author

* **Sacha-Olivier Dulac** - *Initial work* - [Gultar](https://github.com/gultar)

## License

GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007

The Simublock library is licensed under the GNU General Public License v3.0

You may copy, distribute and modify the software as long as you track changes/dates in source files. Any modifications to or software including (via compiler) GPL-licensed code must also be made available under the GPL along with build & install instructions.

For the full licence: [LICENCE](https://tldrlegal.com/license/gnu-general-public-license-v3-(gpl-3)#fulltext)

Copyright (C) 2018 Sacha-Olivier Dulac

## Acknowledgments

* Special thanks to Simply Explained - Savjee and his video on "Creating a blockchain with Javascript", which has been the starting point of this project.

* Link to his video here:  https://www.youtube.com/watch?v=zVqczFZr124
