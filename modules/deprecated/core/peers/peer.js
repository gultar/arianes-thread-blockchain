
const PeerConnection = require('socket.io-client')
const { logger, writeToFile, readFile } = require('../../../tools/utils')

class Peer{

    constructor({ peerAddress }){
        this.address = peerAddress
        this.reputation;
    }

    async connect({ token }){
        let connectionAttempts = 0;
        logger('Attempting to connect to ', this.address)
        
        let config = {
            'reconnection limit' : 1000,
            'max reconnection attempts' : 3,
            'pingInterval': 2000, 
            'pingTimeout': 10000,
            'query':
            {
                token: token,
            }
        }
        
        if(this.address.includes('https')){
            config.rejectUnauthorized = false;
            config.secure = true;
        }

        let peer = PeerConnection(this.address, config)
        peer.on('connect_timeout', (timeout)=>{
            logger('Connection timedout')
            if(connectionAttempts >= 3) {
                peer.destroy()
                resolve(false)
            }else{
                logger('Attempting to reconnect to', this.address)
                connectionAttempts++;
            }
        })
        if(peer){
            return peer
        }else{
            return { error:'ERROR: Could not connect to peer '+this.address }
        }
    }

    peerChannels(peer, address, extendListeners){

        peer.on('message', (message)=>{
            logger(`Node: ${message}`)
        })

        peer.on('peers', (knownPeers)=>{

        })

        peer.on('error', async(err)=>{
            logger(`Socket Error: ${err}`);
        })

        
        if(extendListeners) extendListeners(peer)

    }
}

module.exports = Peer

