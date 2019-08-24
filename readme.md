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
  -s, --seed <seed>                 Seed nodes to initiate p2p connections
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
```
In order to send a transaction, you may either use the CLI tool or send a signed JSON data packet to your local blockchain node.

The basic structure of a transaction is as follows:

{ 
  fromAddress: <ECDSA Public key OR Account name>,
  toAddress: <ECDSA Public key OR Account name>,
  type: <Type of transaction>,
  data: <Extra data to send along>,
  timestamp: <UNIX timestamp>,
  amount: <Amount>,
  hash: <SHA256 hash of the transaction>,
  miningFee: <Enough mining fee to equate size of transaction>,
  signature: <ECDSA Signature from your private key> 
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
