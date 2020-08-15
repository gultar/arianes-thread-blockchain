const Database = require('../classes/database/db')
const PeerReputation = require('./peerReputation')

class ReputationTable{
    constructor(){
        this.reputationDB = new Database('peerReputation')
        this.reputations = {}
    }

    async createPeerReputation(address){
        if(address){
            this.reputations[address] = new PeerReputation(address)
            console.log('Cured', this.cureAddressToKey(address))
            let created = await this.reputationDB.put({
                key:this.cureAddressToKey(address),
                value:this.reputations[address]
            })
            return created
        }else{
            return { error:`ERROR: Could not create reputation entry for ${address}` }
        }
    }

    async getPeerReputation(address){
        let reputationEntry = this.reputations[address]
        if(reputationEntry) return reputationEntry.reputation
        else return false
    }

    async getPeerScore(address){
        let reputationEntry = this.reputations[address]
        if(reputationEntry) return reputationEntry.score
        else return 0
    }

    /**
     * Decrease score on:
     * Send invalid block = 200
     * Send invalid transaction = 50
     * Spam event handler = 200 every warning
     * Download error = 100
     * Peer is falling behind in blocks : 100 + peerOutOfsync flag
     * Reconnects too often (5 times / sec) = 500
     */


    async decreaseReputationScore(address, reason){
        let repEntry = this.reputations[address]
        if(repEntry){
            if(reason == 'spammed'){
                return await repEntry.decreaseScore(500)
            }else if(reason == 'rejectedBlock'){
                return await repEntry.decreaseScore(100)
            }
        }else{
            return { error:new Error(`ERROR: Could not find reputation of ${address}`) }
        }
    }


    cureAddressToKey(address){
        address = this.replaceDotByComma(address)
        address = this.replaceSlashByDash(address)
        address = this.replaceColonsByUnderscore(address)
        return address
    }

    revertKeyToIp(address){
        address = this.replaceCommaByDot(address)
        address = this.replaceDashBySlash(address)
        address = this.replaceUnderscoreByColons(address)
        return address
    }

    replaceColonsByUnderscore(address){
        return address.replace(/:/g, "_")
    }

    replaceUnderscoreByColons(address){
        return address.replace(/_/g, ":")
    }

    replaceDotByComma(address){
        return address.replace(/\./g, ",")
    }

    replaceCommaByDot(address){
        return address.replace(/,/g, ".")
    }

    replaceSlashByDash(address){
        return address.replace(/\//g, "-")
    }

    replaceDashBySlash(address){
        return address.replace(/-/g, "/")
    }

    async loadReputations(){
        let addresses = await this.reputationDB.getAllKeys()
        if(addresses){
            for await(let addressKey of addresses){
                
                let reputation = await this.reputationDB.get(addressKey)
                if(reputation){
                    
                    if(reputation.error) return { error:reputation.error }
                    let address = this.revertKeyToIp(addressKey)
                    this.reputations[address] = new PeerReputation(address, reputation.reputation, reputation.score)
                    await this.reputations[address].adjustReputation()
                    console.log('Reputation:', this.reputations[address])
                }else{
                    return { error:`ERROR: Found reputation key ${address} but not entry` }
                }
                
            }
            return { loaded:true }
        }else{
            return { entriesFound:'none' }
        }
    }

    async saveReputations(){
        for await(let address of Object.keys(this.reputations)){
            let saved = await this.reputationDB.put({
                key:this.cureAddressToKey(address),
                value:this.reputations[address]
            })
            
        }

        return { saved:true }
    }
}

module.exports = ReputationTable