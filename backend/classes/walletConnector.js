const { logger, readFile } = require('../tools/utils')
const Wallet = require('./wallet');
const sha1 = require('sha1');
const ECDSA = require('ecdsa-secp256r1');

class WalletConnector{
  constructor(){
    this.wallets = {};
    this.connectors = {};
  }

  async createWallet(name, password=''){

    if(!name){
      logger(chalk.red('ERROR: Need to provide a wallet name'));
      return false;
    }

    return new Promise(async(resolve, reject)=>{
      let wallet = new Wallet();
      let created = await wallet.init(name);
      if(created){
        wallet.saveWallet(`./wallets/${name}-${wallet.id}.json`);
        this.wallets[wallet.publicKey] = wallet;
        logger('Completed')
        console.log(`Created wallet!`);
        console.log(`Name: ${name}`);
        console.log(`Public key: ${wallet.publicKey}`);
        console.log(`Wallet id: ${wallet.id}`);
        resolve(wallet);
      }else{
        resolve(false)
      }
     
    })
  }

  loadWallet(name){
    let wallet = new Wallet();
    wallet.loadWalletFromFile(name+'-'+sha1(name)+'.json')
    .then((loaded)=>{
      if(loaded){

      }
    })
  }

  getWalletByID(id){
    if(id && this.wallets){
      return this.wallets[id]
    }else{
      logger('Connector does not contain wallets')
    }
  }

  getWalletByPublicAddress(publicAddress){
    if(publicAddress && this.wallets){
      return this.wallets[publicAddress]
    }else{
      logger('Connector does not contain wallets')
    }
  }

  sign(walletName, data){
    if(this.wallets[walletName] && typeof data == 'string'){
      
      try{
        let wallet = this.wallets[walletName];
        return wallet.sign(data);
      }catch(e){
        console.log(e);
      }
      

    }
  }


}

const tryOut = async () =>{
  // let walletFile = await readFile('./wallets/8ab1b499f17855b0f1db5bd65a73875723325f85.json');
  // let wallet = new Wallet()
  // wallet.initFromJSON(JSON.parse(walletFile))
  

  let myWalletConnector = new WalletConnector();
  myWalletConnector.createWallet('hector').then(async (created)=>{
    console.log(await myWalletConnector.sign('hector', 'hello world'))
  })
  
  // myWalletConnector.wallets[wallet.id] = wallet;
  // let sign = myWalletConnector.wallets[wallet.id].privateKey.sign('hello');
  // let pubKey = ECDSA.fromCompressedPublicKey(myWalletConnector.wallets[wallet.id].publicKey)
  // console.log(pubKey.verify('hello', sign))


}

 //tryOut()

module.exports = new WalletConnector()
