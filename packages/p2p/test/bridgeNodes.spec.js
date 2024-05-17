import {expect} from 'expect'
import { peerIdJsons} from './help/index.js'
import {setTimeout} from 'timers/promises'
import BridgeNode from '../src/BridgeNode.js'
import { peerIdFromString } from '@libp2p/peer-id'
const nodes = []
const stopBridgeNodes = async () => {
  for (const node of nodes) await node.stop()
  nodes.length = 0
}
const createBridgeNodes = async (count) => {
  for (let i = 0; i < count; i++) {
    // fixme: get peerid from config eventually some file
    const node = new BridgeNode({port: 9000 + i, isLeader: i === 0, json: {p2p: peerIdJsons[i]}})
    await node.create()
    await node.start()
    nodes.push(node)
  }
  return nodes
}

describe('Bridge node', function () {

  afterEach(async () => await stopBridgeNodes())
  it('should race connect multiple nodes with each other', async function () {
    //Starts breaking beyond 6 nodes. works fine till 6
    let nodes = await createBridgeNodes(6)
    for (const node of nodes){
      for (const peer of nodes){
        if (node.multiaddrs[0] === peer.multiaddrs[0]) continue;
        await node.connect(peer.multiaddrs[0])
      }
    }
  })
  //DHT is needed only furing find(), but that also does not work properly
  //Without DHT also, bootstrap works (partially) i.e. children nodes can locate bootstrap node
  //and get added to its peer list. However, cascading sharing of address book is not happening still
  it.only('should create nodes and discover peers using DHT', async function(){
    let nodes = await createBridgeNodes(6)
    await setTimeout(3000)
    
    //const peerInfo = await nodes[3].p2p.peerRouting.findPeer(peerIdFromString(nodes[4].peerIdJson.id))
    //console.log(peerInfo)

        for (const node of nodes){
      console.log("===================node peerStore===================", node.peerIdJson.id, node.p2p.getPeers())
      //console.log(await node.p2p.peerStore.store.all())
      //await node.p2p.peerStore.forEach(peer => {
        //console.log("peer from store", peer.id)
      //})
    }
    /*for (const node of nodes){
      console.log("find Node", node.peerIdJson.id)
      if (node.peerIdJson.id === nodes[1].peerIdJson.id) continue
      try{
        const peerInfo = await node.p2p.peerRouting.findPeer(peerIdFromString(nodes[1].peerIdJson.id))
        console.log(peerInfo)
      }
      catch(e){
        console.log(e)
      }
      
    }*/
    /*for (const node of nodes){
      for (const peer of nodes){
        if (node.multiaddrs[0] === peer.multiaddrs[0]) continue;
        await node.connect(peer.multiaddrs[0])
      }
    }
    console.log('peerRouting find', nodes[1].peerIdJson.id, peerIdFromString(nodes[1].peerIdJson.id))
    const peerInfo = await nodes[0].p2p.peerRouting.findPeer(peerIdFromString(nodes[1].peerIdJson.id))
    console.log(peerInfo)*/
    
  })
  it('it should be able to connect with other nodes', async function () {
    let [leader, node1, node2, node3, node4, node5, node6] = await createBridgeNodes(7)
    let nodes = [leader, node1, node2, node3, node4, node5, node6]
    // whitelist nodes
    let peerIdsAndMultiAddrs = nodes.map(_ => ({peerId: _.peerId, multiaddr: _.multiaddrs[0]}))
    for (const node of nodes) {
      expect(node.peers.length).toEqual(0)
      node.addPeersToWhiteList(...peerIdsAndMultiAddrs)
    }
    // start connecting
    for (const node of nodes) {
      node.connectToWhiteListedPeers().catch(console.error)
    }
    await setTimeout(1000)
    for (const node of [leader, node1, node2, node3, node4, node5, node6]) {
      expect(node.peers.length).toEqual(nodes.length - 1)
    }

    await leader.startDKG(4)
    await setTimeout(2000)

    for (const node of nodes) {
      node.tssNode.print()
      expect(leader.tssNode.groupPublicKey.serializeToHexStr()).toEqual(node.tssNode.groupPublicKey.serializeToHexStr())
      let leaderSecret = leader.tssNode.secretKeyShare.serializeToHexStr()
      if(leader.peerId === node.peerId) continue
      let nodeSecret = node.tssNode.secretKeyShare.serializeToHexStr()
      expect(leaderSecret).not.toBe(nodeSecret)
    }
  }).timeout(-1)

})


