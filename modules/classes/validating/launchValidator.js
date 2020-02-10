const Validator = require('./validator')
const { workerData } = require('worker_threads')
let validator = new Validator({
    publicKey:workerData.publickey,
    verbose:workerData.verbose,
    keychain:{ name:workerData.walletName, password:workerData.password },
    numberOfCores: 1
})
validator.connect(workerData.nodeAddress)