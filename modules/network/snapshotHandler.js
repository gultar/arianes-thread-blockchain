/***
 * Case 1 - Okay
 * [4]   [4]
 * [5]   [5]
 * [6]   [6]
 * [7]   [7]
 * [8]   [8]
 * 
 * Case 2 - Peer has more blocks
 * [4]   [6]
 * [5]   [7]
 * [6]   [8]
 * [7]   [9]
 * [8]   [10]
 * 
*  Case 1 - Peer is branching
 * [4]   [4]
 * [5]   [5]
 * [6A]   [6B]
 * [7A]   [7B]
 * [8A]   [8B]
 * 
 */


const hasPeerMoreBlocks = async (thisSnapshot, peerSnapshot) =>{
    let thisHashes = Object.keys(thisSnapshot)
    let peerHashes = Object.keys(peerSnapshot)
    
    let lastPeerHash = peerHashes[peerHashes.length - 1]
    let lastChainHash = thisHashes[thisHashes.length - 1]

    let lastPeerBlock = peerSnapshot[lastPeerHash]
    let lastChainBlock = thisSnapshot[lastChainHash]
    

    return ( lastPeerBlock.blockNumber > lastChainBlock.blockNumber ? true : false )
}

const snapshotsAreIdentical = async (thisSnapshot, peerSnapshot) =>{
    let thisHashes = Object.keys(thisSnapshot)
    let peerHashes = Object.keys(peerSnapshot)
    
    for await(let hash of thisHashes){
        let index = thisHashes.indexOf(hash)
        let peerHash = peerHashes[index]

        if(hash !== peerHash) return false
    }

    return true
}

const getHashesInCommon = async (thisSnapshot, peerSnapshot) =>{
    let sameHashes = {}
    let thisHashes = Object.keys(thisSnapshot)
    let peerHashes = Object.keys(peerSnapshot)
    
    for await(let hash of peerHashes){
        let index = peerHashes.indexOf(hash)
        let thisHash = thisHashes[index]
        
        if(hash !== thisHash) sameHashes[hash] = false
        else sameHashes[hash] = true
    }

    return sameHashes
}

const thisNodeShouldUpdate = (thisSnapshot, peerSnapshot) =>{
    let thisHashes = Object.keys(thisSnapshot)
    let peerHashes = Object.keys(peerSnapshot)

    let thisLastHash = thisHashes[thisHashes.length - 1]
    let peerLastHash = peerHashes[peerHashes.length - 1]

    let thisLastBlock = thisSnapshot[thisLastHash]
    let peerLastBlock = peerSnapshot[peerLastHash]
    
    let thisNodeLacksSomeBlocks = peerLastBlock.blockNumber > thisLastBlock.blockNumber

    return thisNodeLacksSomeBlocks
}

const branchesOutAtBlock = async (hashesInCommon, peerSnapshot) =>{
    for await(let hash of Object.keys(hashesInCommon)){
        let isSameHash = hashesInCommon[hash]
        if(!isSameHash) return peerSnapshot[hash]
    }

    return false
}

const chainHasBranch = async (thisSnapshot, peerSnapshot) =>{
    let peerLinks = await buildBlockLinks(peerSnapshot)
    let thisLinks = await buildBlockLinks(thisSnapshot)

    for await(let hash of Object.keys(thisLinks)){
        if(peerLinks[hash] !== thisLinks[hash]) {
            return 
        }
    }
}

const compareSnapshots = async (thisSnapshot, peerSnapshot) =>{
    let peerHashes = Object.keys(peerSnapshot)
    let thisHashes = Object.keys(thisSnapshot)

    let firstHash = thisHashes[0]
    let firstBlock = thisSnapshot[firstHash]

    let thisLastHash = thisHashes[thisHashes.length - 1]
    let peerLastHash = peerHashes[peerHashes.length - 1]

    let thisLastBlock = thisSnapshot[thisLastHash]
    let peerLastBlock = peerSnapshot[peerLastHash]

    let areIdentical = await snapshotsAreIdentical(thisSnapshot, peerSnapshot)
    if(areIdentical) return { identical:true }

    let peerHasMoreBlocks = await hasPeerMoreBlocks(thisSnapshot, peerSnapshot)

    let hashesInCommon = await getHashesInCommon(thisSnapshot, peerSnapshot)
    if(peerHasMoreBlocks){

        let hasHashesInCommon = Object.keys(hashesInCommon).length > 0
        if(!hasHashesInCommon) return { rollback:firstBlock.blockNumber - 10 }

        let needsToUpdate = await thisNodeShouldUpdate(thisSnapshot, peerSnapshot)
        if(needsToUpdate) return { update:true }
        
        let branched = await branchesOutAtBlock(hashesInCommon, peerSnapshot)
        if(!branched) return { update:true }
        
        let peerHasMoreWork = peerLastBlock.totalDifficulty > thisLastBlock.totalDifficulty
        if(!peerHasMoreWork) return { keep:true }

        return { merge:branched.blockNumber - 1 }

    }else{
        let peerHasMoreWork = peerLastBlock.totalDifficulty > thisLastBlock.totalDifficulty
        if(!peerHasMoreWork) return { keep:true }

        let hasHashesInCommon = Object.keys(hashesInCommon).length > 0
        if(!hasHashesInCommon) return { keep:true }
        
        let branched = await branchesOutAtBlock(hashesInCommon, peerSnapshot)
        if(!branched) return { keep:true }

        return  { merge:branched.blockNumber - 1 }
    }
    
}

/**
 * returned values:
 * { keep }
 * { update }
 * { rollback:# }
 * { merge:block }
 * { identical } 
 */

//  const test = async () =>{
//     let snap1 = {}
//     let snap2 = {}
//     let total1 = 0
//     let total2 = 0
//     //Scenario 1 - identical

//     // for(var i=0; i < 10; i++){
//     //     total1 = Math.random() *10 + total1 
//     //     snap1['poubelle'+i] = {
//     //         blockNumber: i,
//     //         hash:'poubelle'+i,
//     //         totalDifficulty: total1
//     //     }
//     //     snap2['poubelle'+i] = {
//     //         blockNumber: i,
//     //         hash:'poubelle'+i,
//     //         totalDifficulty: total1
//     //     }
//     // }
//     // console.log('Scenario one - identical')
//     // console.log(await compareSnapshots(snap1, snap2))

//     console.log('')
//     console.log('Scenario two - offset by 1')

//     for(var i=0; i < 10; i++){
//         total1 = Math.random() *10 + total1
//         total2 = Math.random() *10 + total2 + 10 
//         if(i < 8){
//             snap1['first'+i] = {
//                 blockNumber: i,
//                 hash:'first'+i,
//                 totalDifficulty: total1
//             }
//             two = i+1
//             snap2['first'+i] = {
//                 blockNumber: i,
//                 hash:'first'+i,
//                 totalDifficulty: total2
//             }
//         }else{
//             snap1['first'+i] = {
//                 blockNumber: i,
//                 hash:'first'+i,
//                 totalDifficulty: total1
//             }
//             two = i+1
//             snap2['second'+i] = {
//                 blockNumber: i,
//                 hash:'second'+i,
//                 totalDifficulty: total2
//             }
//         }
//     }

//     console.log(snap1)
//     console.log(snap2)

//     console.log(await compareSnapshots(snap1, snap2))
//     // console.log(await snapshotsAreIdentical(snap1, snap2))
//  }

//  test()

module.exports = compareSnapshots
