# Simuchain

A Nodejs + Socket.io blockchain simulation with signed transactions, p2p communication, block synchronization between peers, and a working proof of work algorithm.



This is a simulation only. It was and is still a project built for leasure and understanding basic blockchain/p2p network structures.

Aside from some fine tuning, here are some possible future implementations:
- Kademlia DHT Peer discovery system, similar to ethereum's.
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

### Connecting to the blockchain

Then you can either instantiate the class by using

```
let myNode = new Node(ipAddress, port);
myNode.startServer();

```

or by running index.js for a CLI-like interface.

```
node index.js start <ip> <port>
```

To get a list of all options :
```
$ node index.js --help
Usage: index [command] [options] 

Options:
  -V, --version           output the version number
  -j, --join              Joins network
  -m, --mine              Starts the node as a miner
  -u, --update            Tries to update chain by querying for the longest chain in the network
  -s, --seed              Seed nodes to initiate p2p connections
  -h, --help              output usage information

Commands:
  start <address> <port>  Starts blockchain node


```

## Running the tests

Explain how to run the automated tests for this system

### Break down into end to end tests

Explain what these tests test and why

```
Give an example
```

### And coding style tests

Explain what these tests test and why

```
Give an example
```

## Deployment

Add additional notes about how to deploy this on a live system

## Built With

* [Dropwizard](http://www.dropwizard.io/1.0.2/docs/) - The web framework used
* [Maven](https://maven.apache.org/) - Dependency Management
* [ROME](https://rometools.github.io/rome/) - Used to generate RSS Feeds

## Contributing

Please read [CONTRIBUTING.md](https://gist.github.com/PurpleBooth/b24679402957c63ec426) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your/project/tags).

## Authors

* **Billie Thompson** - *Initial work* - [PurpleBooth](https://github.com/PurpleBooth)

See also the list of [contributors](https://github.com/your/project/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* Special thanks to Simply Explained - Savjee and his video on "Creating a blockchain with Javascript", which has been the starting point of this project.

* Link to his video here:  https://www.youtube.com/watch?v=zVqczFZr124
