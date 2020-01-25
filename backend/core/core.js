
/**
 * Core: {
 *      Server (Handles inbound connections, basic listeners defined here but any events related to blockchain defined elsewhere. Socket exported)
 *      Protocol (sendPeerMessage, receivePeerMessage -handlers not defined here. All functions exported)
 *      Discovery (Broadcasts possible new peer addresses through tokens)
 *      Class Peer (
 *                  - Creates new outbound connection
 *                  - Basic listeners defined here but any events related to blockchain defined elsewhere. 
 *                  - Authenticity of target peer is verified here through some chosen method
 *                  - Socket exported)
 *      Handlers (Requires access to Blockchain. Exports all handlers)
 *      Blockchain (Requires Mempool to be instanciated before. Exports Object)
 *      
 * }
 * 
 */