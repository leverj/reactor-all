import NetworkNode from './NetworkNode.js'
import {generateDkgId, TSSNode} from './TSSNode.js'
import {affirm, logger} from '@leverj/common/utils'
import {shortHash, tryAgainIfEncryptionFailed, waitToSync} from './utils.js'
import events, {INFO_CHANGED, PEER_DISCOVERY} from './events.js'
import config from 'config'
import {setTimeout} from 'node:timers/promises'
import Monitor from './Monitor.js'
import Whitelist  from './Whitelist.js'

const TSS_RECEIVE_SIGNATURE_SHARE = 'TSS_RECEIVE_SIGNATURE_SHARE'
const SIGNATURE_START = 'SIGNATURE_START'
const WHITELIST_TOPIC = 'WHITELIST'
const WHITELIST_REQUEST = 'WHITELIST_REQUEST'
const DKG_INIT_THRESHOLD_VECTORS = 'DKG_INIT_THRESHOLD_VECTORS'
const DKG_RECEIVE_KEY_SHARE = 'DKG_RECEIVE_KEY_SHARE'
const meshProtocol = '/bridgeNode/0.0.1'

logger.log('bootstrapNodes', config.bridgeNode.bootstrapNodes)

export default class BridgeNode extends NetworkNode {
  constructor({ip = '0.0.0.0', port = 0, isLeader = false, json}) {
    super({ip, port, peerIdJson: json?.p2p})
    this.isLeader = isLeader
    this.tssNodeJson = json?.tssNode
    this.whitelist = new Whitelist(json?.whitelist)
    this.leader = json?.leader
    this.tssNode = null
    this.messageMap = {}
    this.monitor = new Monitor()
    //fixme: changes when real whitelisting done
    if (this.isLeader) {
      events.on(PEER_DISCOVERY, (peerId) => this.addPeersToWhiteList(peerId))
    }
  }

  exportJson() {
    return {
      p2p: super.exportJson(),
      tssNode: this.tssNode.exportJson(),
      whitelist: this.whitelist.exportJson(),
      leader: this.leader
    }
  }

  async create() {
    await super.create()
    this.tssNode = new TSSNode(this.peerId, this.tssNodeJson)
    const dkgId = this.tssNode.id.serializeToHexStr()
    this.tssNode.addMember(dkgId, this.tssNode.onDkgShare.bind(this.tssNode)) // making self dkg share
    this.registerStreamHandler(meshProtocol, this.onStreamMessage.bind(this))
    if (this.whitelist.json) this.addPeersToWhiteList(...this.whitelist.json)
    await this.start()
    await this.addLeader()
    await this.requestWhitelist()
    events.emit(INFO_CHANGED)
    this.ping()
    return this
  }

  async addLeader() {
    this.leader = this.isLeader ? this.peerId : config.bridgeNode.bootstrapNodes[0].split('/').pop()
    this.addPeersToWhiteList(this.leader)
    if (this.isLeader) return
    await waitToSync([_ => this.peers.indexOf(this.leader) !== -1], -1)
    // await tryAgainIfEncryptionFailed(async () => await this.connect(this.leader))
    // await this.connectPubSub(this.leader)
    // await this.subscribe(WHITELIST_TOPIC)
    // await this.subscribe(SIGNATURE_START)
    // logger.log('Connected to leader', this.port, shortHash(this.leader))
  }

  addPeersToWhiteList(...peerIds) {
    for (const peerId of peerIds) {
      const dkgId = this.whitelist.add(peerId)
      if (peerId !== this.peerId) this.tssNode.addMember(dkgId, this.sendMessageToPeer.bind(this, peerId, DKG_RECEIVE_KEY_SHARE))
    }
    logger.log('Added to whitelist', peerIds.map(shortHash).join(', '))
    events.emit(INFO_CHANGED)
  }

  async requestWhitelist() {
    if (this.isLeader) return
    await this.sendMessageToPeer(this.leader, WHITELIST_REQUEST, '')
  }

  async publishWhitelist() {
    if (!this.isLeader) return
    this.whitelist.canPublish = true
    let message = JSON.stringify(this.whitelist.exportJson())
    await this.publishOrFanOut(WHITELIST_TOPIC, message, this.monitor.filter(this.whitelist.get()))
  }

  async publishOrFanOut(topic, message, peerIds, fanOut = true) {
    if (!fanOut) return await this.publish(topic, message)
    for (const peerId of peerIds) {
      if (peerId === this.peerId) continue
      await this.sendMessageToPeer(peerId, topic, message)
    }
  }

  async aggregateSignature(txnHash, message) {
    const signature = await this.tssNode.sign(message)
    this.messageMap[txnHash] = {}
    this.messageMap[txnHash].verified = false
    this.messageMap[txnHash].signatures = [{message, signature: signature.serializeToHexStr(), 'signer': this.tssNode.id.serializeToHexStr()}]
    await this.publishOrFanOut(SIGNATURE_START, JSON.stringify({txnHash, message}), this.monitor.filter(this.whitelist.get()))
  }

  async sendMessageToPeer(peerId, topic, message) {
    const messageStr = JSON.stringify({topic, message})
    await this.createAndSendMessage(peerId, meshProtocol, messageStr)
  }

  async connectPubSub(peerId) {
    await super.connectPubSub(peerId, this.onPubSubMessage.bind(this))
  }

  async onPubSubMessage({peerId, topic, data}) {
    switch (topic) {
      case WHITELIST_TOPIC:
        await this.handleWhitelistMessage(peerId, JSON.parse(data))
        break
      case SIGNATURE_START:
        await this.handleSignatureStart(peerId, JSON.parse(data))
        break
      default:
        console.log('Unknown topic', topic)
    }
  }

  async handleWhitelistMessage(peerId, peerIds) {
    if (this.leader !== peerId) return logger.log('Ignoring whitelist from non-leader', peerId)
    this.addPeersToWhiteList(...peerIds)
  }

  async handleSignatureStart(peerId, data) {
    if (this.leader !== peerId) return logger.log('Ignoring signature start from non-leader', peerId, this.leader)
    const {txnHash, message} = data
    const signature = await this.tssNode.sign(message)
    logger.log(SIGNATURE_START, txnHash, message, signature.serializeToHexStr())
    const signaturePayloadToLeader = {topic: TSS_RECEIVE_SIGNATURE_SHARE, signature: signature.serializeToHexStr(), signer: this.tssNode.id.serializeToHexStr(), txnHash}
    await this.createAndSendMessage(peerId, meshProtocol, JSON.stringify(signaturePayloadToLeader), (msg) => { console.log('SignaruePayload Ack', msg) })
  }

  async onStreamMessage(stream, peerId, msgStr) {
    const msg = JSON.parse(msgStr)
    affirm(this.whitelist.exists(peerId, `Unknown peer ${peerId}`))
    switch (msg.topic) {
      case WHITELIST_REQUEST:
        if (this.whitelist.canPublish) await this.sendMessageToPeer(peerId, WHITELIST_TOPIC, JSON.stringify(this.whitelist.get()))
        break
      case WHITELIST_TOPIC:
        await this.handleWhitelistMessage(peerId, JSON.parse(msg.message))
        break
      case DKG_INIT_THRESHOLD_VECTORS:
        this.tssNode.generateVectors(msg.threshold)
        await this.tssNode.generateContribution()
        break
      case DKG_RECEIVE_KEY_SHARE:
        this.tssNode.onDkgShare(msg.message)
        break
      case TSS_RECEIVE_SIGNATURE_SHARE:
        const {txnHash, signature, signer} = msg
        this.messageMap[txnHash].signatures.push({signature: signature, signer: signer})
        logger.log('Received signature', txnHash, signature,)
        if (this.messageMap[txnHash].signatures.length === this.tssNode.threshold) {
          const groupSign = this.tssNode.groupSign(this.messageMap[txnHash].signatures)
          this.messageMap[txnHash].verified = this.tssNode.verify(groupSign, this.messageMap[txnHash].signatures[0].message)
          logger.log('Verified', txnHash, this.messageMap[txnHash].verified, groupSign)
        }
        break
      case SIGNATURE_START:
        await this.handleSignatureStart(peerId, JSON.parse(msg.message))
        break
      default:
        console.log('Unknown message', msg)
    }
  }

  getAggregateSignature(txnHash) {
    return this.messageMap[txnHash]
  }

  async startDKG(threshold) {
    if (!this.isLeader) return
    const responseHandler = (msg) => logger.log('dkg received', msg)
    for (const peerId of this.whitelist.get()) {
      if (this.peerId === peerId) continue
      let message = JSON.stringify({topic: DKG_INIT_THRESHOLD_VECTORS, threshold})
      await this.createAndSendMessage(peerId, meshProtocol, message, responseHandler)
    }
    await this.tssNode.generateVectors(threshold)
    await this.tssNode.generateContribution()
  }

  async ping() {
    let peerIds = this.whitelist.get()
    for (const peerId of peerIds) {
      if (peerId === this.peerId) continue
      this.monitor.updateLatency(peerId, await super.ping(peerId))
      await setTimeout(100)
    }
    setTimeout(1000).then(this.ping.bind(this))
  }

}

