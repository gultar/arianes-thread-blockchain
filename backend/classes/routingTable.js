

class RoutingTable{
    constructor(){
        this.contacts = {}
    }

    addPeer(contact){
        if(!this.contacts[contact.id]){
            this.contacts[contact.id] = contact
            return true
        }else{
            return false
        }
    }

    removePeer(){
        if(this.contacts[contact.id]){
            delete this.contacts[contact.id]
            return true
        }else{
            return false
        }
    }

    getNode(id){
        return this.contacts[id]
    }

    maintainTable(){

    }
}

