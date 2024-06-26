import {Router} from 'express'
import config from 'config'
import {bridgeNode} from './manager.js'
import {peerIdFromString} from '@libp2p/peer-id'

const multiaddr = `/ip4/${config.externalIp}/tcp/${config.bridgeNode.port}/p2p/${bridgeNode.peerId}`

async function getMultiaddrs(req, res) {
  res.send({multiaddr})
}

async function getAllMultiaddrs(req, res) { res.send(bridgeNode.multiaddrs)}

async function getPeers(req, res) { res.send(bridgeNode.peers)}

function getPeersStatus(req, res) {
  res.send(bridgeNode.monitor.getPeersStatus())
}
async function startDkg(req, res) {
  await bridgeNode.startDKG(config.bridgeNode.threshold)
  res.send('ok')
}

async function aggregateSignature(req, res) {
  if (!bridgeNode.isLeader) return
  const msg = req.body
  await bridgeNode.aggregateSignature(msg.txnHash, msg.msg)
  res.send('ok')
}

async function getAggregateSignature(req, res) {
  res.send(bridgeNode.getAggregateSignature(req.query.txnHash))
}

async function publishWhitelist(req, res) {
  if (!bridgeNode.isLeader) return
  await bridgeNode.publishWhitelist()
  res.send('ok')
}

async function getBootstrapPeers(req, res) {
  const peers = bridgeNode.peers
  const all = []
  for (const peer of peers) {
    const info = await bridgeNode.p2p.peerRouting.findPeer(peerIdFromString(peer))
    all.push(info)
  }
  // console.log('#'.repeat(50), 'peerinfo', all)
  res.send(all)
}

export const router = Router()
router.get('/fixme/bridge/multiaddr', getMultiaddrs)
router.get('/fixme/bridge/multiaddr/all', getAllMultiaddrs)
router.get('/peer', getPeers)
router.get('/peer/status', getPeersStatus)
router.get('/peer/bootstrapped', getBootstrapPeers)
router.post('/tss/aggregateSign', aggregateSignature)
router.get('/tss/aggregateSign', getAggregateSignature)
router.post('/dkg/start', startDkg)
router.post('/publish/whitelist', publishWhitelist)
export default router
