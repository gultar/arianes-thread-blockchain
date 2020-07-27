const makeExternal = require('makeExternal')
const getCurrentBlock = require('getCurrentBlock')
const getBalance = require('getBalance')
const Payable = require('Payable')
const deferPayable = require('deferPayable')
const emitPayable = require('emitPayable')

class Escrow{
    constructor(initParams){
        this.contractAccount = initParams.contractAccount
        this.state = {
            'empty':'empty'
        }
    }

    setState(state){
        this.state = state
    }

    create({ id, buyer, seller, start, end, delayToBlock }, callingAccount){
        if(!id) throw new Error('ERROR: Must provide id')
        if(!buyer) throw new Error('ERROR: Must provide buyer account')
        if(!seller) throw new Error('ERROR: Must provide seller account')
        
        let exists = this.state[id]
        if(exists) throw new Error(`ERROR: Escrow account with id ${id} already exists`)

        let areDifferent = buyer !== seller
        if(!areDifferent) throw new Error('ERROR: Buyer and seller must be different accounts')

        this.state[id] = {
            id:id,
            creator:callingAccount.name,
            buyer:buyer,
            seller:seller,
            amount:0,
            start: start || Date.now(),
            end: end || Date.now() + ( 10 * 24 * 60 * 60 * 1000 ), //10 days
            delayToBlock:delayToBlock || false,
            deposit: {},
            buyerAccepts:false,
            sellerAccepts:false
        }
        
        return { created:`Escrow account of id ${id}` }
    }

    async deposit({ id, amount, callingAction }, callingAccount){
        if(!id) throw new Error('ERROR: Must provide id')
        if(!amount || typeof amount !== 'number') throw new Error('ERROR: Must provide valid numerical amount to deposit')
        
        let escrow = this.state[id]
        if(!escrow) throw new Error('ERROR: Must create escrow account before depositing')

        let isAuthorized = escrow.buyer === callingAccount.name
        if(!isAuthorized) throw new Error(`ERROR: Account ${callingAccount.name} cannot deposit on escrow account ${id}`)

        //Would maybe be better to get balance of callingAccount directly
        let walletBalance = await getBalance(callingAccount.name)
        console.log('Balance:',walletBalance)
        if(walletBalance.balance < amount) throw new Error(`ERROR: ${callingAccount.name} does not have sufficient funds to deposit`)
        
        //Check balance first
        escrow.amount = amount
        escrow.deposit = callingAction.transaction
        this.state[id] = escrow

        return { deposited:`Deposited ${amount} on escrow account ${id}` }

    }

    async accept({ id }, callingAccount){
        if(!id) throw new Error('ERROR: Must provide id')

        let escrow = this.state[id]
        if(!escrow) throw new Error(`ERROR: Escrow account ${id} does not exist`)

        let isAuthorizedBuyer = escrow.buyer === callingAccount.name
        let isAuthorizedSeller = escrow.seller === callingAccount.name
        if(!isAuthorizedSeller && !isAuthorizedBuyer) throw new Error(`ERROR: Account ${callingAccount.name} is not authorized`)

        if(isAuthorizedBuyer && !escrow.deposit){
            throw new Error('ERROR: Buyer needs to deposit an amount before accepting')
        }

        if(isAuthorizedBuyer) escrow.buyerAccepts = true
        else if(isAuthorizedSeller) escrow.sellerAccepts = true

        if(escrow.buyerAccepts && escrow.sellerAccepts){
            return await this.pay(escrow)
        }else{
            return { accepted:true }
        }
    }

    async pay(escrow){
        let currentBlock = await getCurrentBlock()
        let deposit = escrow.deposit

        let payable = new Payable({
            fromAddress:escrow.buyer,
            toAddress:escrow.seller,
            amount:escrow.amount,
            reference:deposit,
            fromContract:this.contractAccount,
            delayToBlock: (escrow.delayToBlock ? currentBlock + escrow.delayToBlock : false )
        })

        delete this.state[escrow.id]
        
        if(escrow.delayToBlock){
            let deferred = await deferPayable(payable)
            if(deferred.error) throw new Error(deferred.error)
        }else {
            let emitted = await emitPayable(payable)
            if(emitted.error) throw new Error(emitted.error)
        }

        
        return { paid:`Escrow account ${escrow.id} will pay ${escrow.seller} ${escrow.amount} coins from ${escrow.buyer}${(escrow.delayToBlock ? 'in '+escrow.delayToBlock+' blocks':'')}` }
    }

    cancel({ id }, callingAccount){
        if(!id) throw new Error('ERROR: Must provide id')

        let escrow = this.state[id]
        if(!escrow) throw new Error(`ERROR: Escrow account ${id} does not exist`)

        let isAuthorized = escrow.creator == callingAccount.name || escrow.seller == callingAccount.name || escrow.buyer == callingAccount.name
        if(!isAuthorized) throw new Error(`ERROR: ${callingAccount.name} is not authorized`)

        delete this.state[id]

        return { cancelled:`Escrow account ${id} was cancelled by ${callingAccount.name}` }
    }

    getEscrow({ id }){
        let escrow = this.state[id]
        if(!escrow) return { unknown:'Escrow account not found' }
        else return escrow
    }

    getInterface(){
        let api = makeExternal({
            create:{
                type:'set',
                args:["id", "buyer", "seller", "start", "end", "price", "delayToBlock"],
                required:["id", "buyer", "seller"],
                description:'Create a new escrow account'
            },
            deposit:{
                type:'set',
                args:["id", "amount"],
                description:'Deposit a sum in an escrow account'
            },
            accept:{
                type:'set',
                args:["id"],
                description:'Accept the conditions and payments of the escrow. Both parties must accept'
            },
            getEscrow:{
                type:'get',
                args:["id"],
                description:'Returns the state of an escrow account'
            },
            cancel:{
                type:'set',
                args:["id"],
                description:'Either party may cancel escrow at any time, except when payment has been passed'
            }
        })

        return api
    }
}

/** 
 * pragma solidity ^0.4.11;
contract Escrow {
    uint balance;
    address public buyer;
    address public seller;
    address private escrow;
    uint private start;
    bool buyerOk;
    bool sellerOk;
function Escrow(address buyer_address, address seller_address) public {
        // this is the constructor function that runs ONCE upon initialization
        buyer = buyer_address;
        seller = seller_address;
        escrow = msg.sender;
        start = now; //now is an alias for block.timestamp, not really "now"
    }
    
    function accept() public {
        if (msg.sender == buyer){
            buyerOk = true;
        } else if (msg.sender == seller){
            sellerOk = true;
        }
        if (buyerOk && sellerOk){
            payBalance();
        } else if (buyerOk && !sellerOk && now > start + 30 days) {
            // Freeze 30 days before release to buyer. The customer has to remember to call this method after freeze period.
            selfdestruct(buyer);
        }
    }
    
    function payBalance() private {
        // we are sending ourselves (contract creator) a fee
        escrow.transfer(this.balance / 100);
        // send seller the balance
        if (seller.send(this.balance)) {
            balance = 0;
        } else {
            throw;
        }
    }
    
    function deposit() public payable {
        if (msg.sender == buyer) {
            balance += msg.value;
        }
    }
    
    function cancel() public {
        if (msg.sender == buyer){
            buyerOk = false;
        } else if (msg.sender == seller){
            sellerOk = false;
        }
        // if both buyer and seller would like to cancel, money is returned to buyer 
        if (!buyerOk && !sellerOk){
            selfdestruct(buyer);
        }
    }
    
    function kill() public constant {
        if (msg.sender == escrow) {
            selfdestruct(buyer);
        }
    }
}
*/