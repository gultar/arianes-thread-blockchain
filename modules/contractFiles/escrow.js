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
        if(walletBalance.balance < amount) throw new Error(`ERROR: ${callingAccount.name} does not have sufficient funds to deposit`)
        
        //Check balance first
        escrow.amount = amount
        escrow.deposit = callingAction.transaction
        this.state[id] = escrow

        return { deposited:`Deposited ${amount} on escrow account ${id}` }

    }

    async accept({ id, callingAction }, callingAccount){
        if(!id) throw new Error('ERROR: Must provide id')

        let escrow = this.state[id]
        if(!escrow) throw new Error(`ERROR: Escrow account ${id} does not exist`)

        let isAuthorizedBuyer = escrow.buyer === callingAccount.name
        let isAuthorizedSeller = escrow.seller === callingAccount.name
        if(!isAuthorizedSeller && !isAuthorizedBuyer) throw new Error(`ERROR: Account ${callingAccount.name} is not authorized`)

        if(isAuthorizedBuyer && !escrow.deposit){
            throw new Error('ERROR: Buyer needs to deposit an amount before accepting')
        }

        if(isAuthorizedBuyer){
            escrow.buyerAccepts = true
            escrow.reference = callingAction.transaction
        }
        if(isAuthorizedSeller) escrow.sellerAccepts = true

        this.state[id] = escrow
        if(escrow.buyerAccepts && escrow.sellerAccepts){
            let payable = await this.pay(escrow)
            
            this.state[id] = {}
            delete this.state[id]
            if(escrow.delayToBlock) deferPayable(payable)
            else  emitPayable(payable)

            return { paid:true }
            
        }else{
            return { accepted:true }
        }
    }

    async pay(escrow){
        let delay = false
        if(escrow.delayToBlock){
            let currentBlock = await getCurrentBlock()
            delay = currentBlock.blockNumber = escrow.delayToBlock
        }
        let payable = new Payable({
            fromAddress:escrow.buyer,
            toAddress:escrow.seller,
            amount:escrow.amount,
            reference:escrow.reference,
            fromContract:this.contractAccount,
            delayToBlock: delay
        })
        
        return payable
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
                emits:'Payable',
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