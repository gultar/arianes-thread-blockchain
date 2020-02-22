const Producer = require('./producer')
const { workerData } = require('worker_threads')
let producer = new Producer({
    publicKey:workerData.publickey,
    verbose:workerData.verbose,
    keychain:{ name:workerData.walletName, password:workerData.password },
    numberOfCores: 1
})
producer.connect(workerData.nodeAddress)