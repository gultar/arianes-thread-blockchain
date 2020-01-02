export {}

let makeExternal = require('makeExternal');
let ContractAction = require('ContractAction')
let deferExecution = require('deferExecution')
let Permissions = require('Permissions')
let getCurrentBlock = require('getCurrentBlock')

interface AuctionHall{
    contractAccount: object,
    state: AuctionState
}

interface AuctionState{
    liveAuctions: object,
    finishedAuctions: object
}


interface Bid{
    amount: number,
    name: string,
    timestamp: number
}

interface ContractAction{ 
    fromAccount: string, 
    toAccount?: string, 
    task: string, 
    actionReference: object
}

interface ActionPayload{
    method:string,
    cpuTime: number,
    params: object,
    contractName: string
}

interface Action{ 
    fromAccount: string, 
    type: string, 
    task: string, 
    data: ActionPayload,
    hash: string
}

interface Auction{
    id: string,
    description: any,
    startingPrice: number,
    closeAuctionIn: number,
    highestBid: number,
    highestBidder: Account,
    bids: Array<Bid>,
    winner: Account,
    permissions?: any,
    creatorAccount: Account,
}

interface CreateParams{
    id: string,
    description:any,
    startingPrice: number,
    closeAuctionIn: number,
    selectedBidders?: Array<Permission>,
    callingAction?: Action
}

interface Account{
    name: string,
    ownerKey: string,
}

interface Permission{
    [account: string]:string
}

class Auction{
    constructor(params){
        let { id, description, startingPrice, closeAuctionIn } = params;
        this.id = id;
        this.description = description;
        this.startingPrice = startingPrice;
        this.closeAuctionIn = closeAuctionIn;
        this.permissions;
    }

    async setPermissions(permissionedAccounts: Array<Permission>, callingAccount: string): Promise<object>{
        this.permissions = new Permissions(callingAccount)
        let accountsPermissioned = await this.permissions.defileMultipleAccounts(permissionedAccounts)
        if(accountsPermissioned.error) throw new Error(accountsPermissioned.error)

        return {
            success: `Granted permission to ${permissionedAccounts.length}`
        }
    }
}

class AuctionHall{
    constructor(initParams){
        this.contractAccount = initParams.contractAccount;
        this.state = {
            liveAuctions:{},
            finishedAuctions:{}
        }
    }

    setState(state: AuctionState): void{
        this.state = state
    }

    async create({ id, description, startingPrice, closeAuctionIn, selectedBidders, callingAction }: CreateParams, callingAccount: Account): Promise<object>{
        if(!id || typeof id !== 'string') throw new Error('ERROR: Need to provide string id to create a new auction')
        if(!startingPrice || typeof startingPrice !== 'number') throw new Error('ERROR: Need to provide numerical starting price to create a new auction')
        if(!closeAuctionIn) throw new Error('ERROR: Need to provide numerical block time limit to create a new auction')
        if(selectedBidders && !Array.isArray(selectedBidders)) throw new Error('ERROR: To set permissions, provide an array of {"accountName":"permission"} pairs')
        
        let auctions = this.state.liveAuctions
        let params = {
            id:id,
            description: description,
            startingPrice: startingPrice,
            closeAuctionIn: closeAuctionIn //Either block at which to close the auction or the number of blocks to wait until is closed??
        }
        auctions[id] = new Auction(params)
        auctions[id].creatorAccount = callingAccount

        if(selectedBidders){
            let permissionsSet = await auctions[id].defileMultipleAccounts(selectedBidders)
            if(permissionsSet.error) throw new Error(permissionsSet.error)
        }
        console.log('New auction:', auctions[id])
        let placed = await this.deferClosingOfAuction(closeAuctionIn, id,callingAction, callingAccount)
        return {
            success: placed,
            message: `Created auction ${id} starting at ${startingPrice}. Auction will close at block number ${closeAuctionIn}`
        }

    }

    async closeAuction(params, callingAccount){
        let { id } = params;
        if(id){
            let auctions = this.state.liveAuctions
            let auction = auctions[id]

            if(auction){
                let creatorAccount = auction.creatorAccount;

                if(callingAccount.ownerKey === creatorAccount.ownerKey){
                    let highestBidder = auction.highestBidder;
                    let highestBid = auction.highestBid;

                    auction.winner = {
                        name:highestBidder,
                        amount: highestBid
                    }

                    this.state.finishedAuctions[id] = auction;

                    delete this.state.liveAuctions[id]

                    return auction.winner
                }else{
                    throw new Error(`ERROR: Only the creator of the auction may close it`);
                }
                //Select highest bidder then transfer the staked token transaction (not native coins)
            }else{
                throw new Error(`ERROR: Auction ${id} is undefined`)
            }
        }else{
            throw new Error('ERROR: Need to provide valid auction ID')
        }
    }

    async deferClosingOfAuction(numOfBlocks: number, auctionID:string, callingAction: Action, callingAccount: Account): Promise<object>{
        let currentBlock = await getCurrentBlock()
        
        let contractAction = new ContractAction({ 
            fromAccount:callingAccount.name, 
            data:{
                contractName:this.contractAccount,//Self executing action is simply a deferred execution
                method:'closeAuction',
                params:{
                    id:auctionID
                },
                cpuTime:60,
            },
            task:'call',
            delayToBlock:currentBlock.blockNumber + numOfBlocks,
            actionReference:callingAction
        })

        let sent = await deferExecution(contractAction);
        if(sent.error) throw new Error(sent.error)
        else return sent;
    }

    async bid({ id, amount, callingAction }, callingAccount): Promise<object>{
        let auctions = this.state.liveAuctions
        let auction = auctions[id]

        if(auction){
            let highestBid = auction.highestBid;

            if(amount > highestBid){
                auction.highestBid = amount;
                auction.highestBidder = callingAccount.name;

                return { success:`Bid placed at ${amount} by ${callingAccount.name}` }
            }
        }else{
            throw new Error(`ERROR: Auction ${id} does not exist`)
        }

    }

    async getAuctionState(id): Promise<Auction>{
        let auctions = this.state.liveAuctions
        let auction = auctions[id]

        if(auction){
            return auction
        }else{
            throw new Error(`ERROR: Auction ${id} does not exist`)
        }
    }

    getInterface(): object{
        let api = makeExternal({
            create:{
                type:'set',
                args:[
                    "id: string",
                    "description: string",
                    "startingPrice: number",
                    "timeLimit: Date"
                ],
                description:'Create a new auction'
            },
            closeAuction:{
                type:'set',
                args:[
                    "id: string",
                ],
                description:"Close an auction and select a winner. May only be invoked by the auction's creator"
            },
            bid:{
                type:'set',
                args:['id: string','price: number'],
                description:'Place a bid on a given auction'
            },
            getAuctionState:{
                type:'get',
                args:['id: string'],
                description:'Get the state of a given auction'
            }
        })
        return api
    }
}