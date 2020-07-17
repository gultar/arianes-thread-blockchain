# Kheops.js Blockchain framework

A Nodejs + Socket.io + Rocket-Store Blockchain platform with support for smart contracts written in Nodejs and pluggable consensus protocol. The platform is shipped with Proof of Work and Permissioned capabilities. It's still a WIP and will likely remain so for a while but feel free to reach out or contribute to this project as I would like to see it put to good use eventually

### Prerequisites

- Node.js (latest version)

## Getting Started

You need to clone the repo in a folder

```
git clone https://github.com/gultar/blockchain
cd ./blockchain
```
Then you need to install Node.js, if you haven't already

```
$ curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
$ sudo apt-get install -y nodejs
```

To get the blockchain up and running you first need to get all the dependencies

```
npm install
```
### Configuring the blockchain

Almost all configurations for the generation of blocks are found in the
./config/genesis.json. 

You can set the balances of accounts for the ICO.
Other configurations like block times, initial/minimum difficulty and much more 
can be set in this file. Default configurations are those of the main network.

You can then set your node's network configs at
./config/nodeconfig.json


### Connecting to the blockchain

Then you can either instantiate the class by using

```
let myNode = new Node({
  host: "123.123.123.123", //If dht peer discovery is enable, is public ip of network
  lanHost: "192.168.1.1", //Internal IP, optional
  port: "8000",  //ioServer port
  verbose: false, //Displays more info like transactions sent
  httpsEnabled: true,  //Enables HTTP REST api
  exposeHTTP: false,  //Make HTTP REST Api public
  enableLocalPeerDiscovery: false,  //MSSDNS, over local network
  enableDHTDiscovery: true, //DHT, over the internet
  peerDiscoveryPort: "6000", 
  network:"mainnet",  //Name of network to connect to
  noLocalhost:false,  //Enable connects on same environment
  genesis:genesis,  //Gotten from ./modules/tools/getGenesis
  minerWorker:false,  //Enable worker on same node.js process but in a worker. No advised, unless on a small private network
  clusterMiner:program.clusterMiner,  //Number of cores to use in worker. Default: 1
  keychain:program.keychain //In case of miner worker, wallet and password
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
  -i, --ipaddress <hostname>        Specify node hostname
  -p, --port <port>                 Specify node port
  -s, --seeds <seeds>               Seed nodes to initiate p2p connections
  -v, --verbose                     Enable transaction and network verbose
  -d, --peerDiscovery [type]        Enable peer discovery using various methods
  -t, --peerDiscoveryPort <port>    Enable peer discovery using various methods
  -l, --dhtDisconnectDelay <delay>  Length of time after which the node disconnects from dht network
  -m, --mine                        Start a block miner child process alongside the node
  -c, --clusterMiner [numbers]      Launch a cluster of miners. Default: 1 workers
  -w, --walletName <walletName>     Name of the miner wallet
  -k, --password <password>         Password needed to unlock wallet
  -x, --exposeHTTP                  Expose HTTP API to allow external interaction with blockchain node
  -n, --network <network>           Blockchain network to join
  -h, --help                        output usage information

Commands:
  start                             Starts blockchain node


```

## Sending a transaction

In order to send a transaction, you may either use the CLI tool or send a signed JSON data packet to your local blockchain node.
The transaction will then be relayed to all connected peers for validation and mining.

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


### Transaction Calls

By sending a transaction of type <call> you may interact with smart contracts stored on the blockchain
The basic structure of the data payload must be consistent in order for the transaction to be
validated by other nodes. Here is an example of the data payload located in the data field in the transaction:

```
{
  'method':'contractMethod',
  'cpuTime':0-100,
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
    toAddress: 'Tokens',   //Name of the Contract
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

### Actions

Actions are usually less expensive than transaction calls. 

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
