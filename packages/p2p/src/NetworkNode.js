import {createLibp2p} from 'libp2p'
import {peerIdFromString} from '@libp2p/peer-id'
import {tcp} from '@libp2p/tcp'
import {noise} from '@chainsafe/libp2p-noise'
import {yamux} from '@chainsafe/libp2p-yamux'
import {ping} from '@libp2p/ping'
import {autoNAT} from '@libp2p/autonat'
import {gossipsub} from '@chainsafe/libp2p-gossipsub'
import {fromString as uint8ArrayFromString} from 'uint8arrays/from-string'
import {toString as uint8ArrayToString} from 'uint8arrays/to-string'
import map from 'it-map'
import {pipe} from 'it-pipe'
import {createFromJSON} from '@libp2p/peer-id-factory'
import {bootstrap} from '@libp2p/bootstrap'
import {identify} from '@libp2p/identify'
import {kadDHT, removePrivateAddressesMapper, removePublicAddressesMapper} from '@libp2p/kad-dht'
import {tryAgainIfError} from './utils.js'
import config from 'config'
import {logger} from '@leverj/common/utils'

export default class NetworkNode {
  constructor({ip = '0.0.0.0', port = 0, peerIdJson}) {
    this.peerIdJson = peerIdJson
    this.ip = ip
    this.port = port
    this.streams = {}
  }

  get multiaddrs() { return this.p2p.getMultiaddrs().map((addr) => addr.toString()) }

  get peerId() { return this.p2p.peerId.toString() }

  get peers() { return this.p2p.getPeers().map((peer) => peer.toString()) }

  exportJson() {
    return {
      privKey: uint8ArrayToString(this.p2p.peerId.privateKey, 'base64'), pubKey: uint8ArrayToString(this.p2p.peerId.publicKey, 'base64'), id: this.peerId
    }
  }

  async create() {
    const peerId = this.peerIdJson ? await createFromJSON(this.peerIdJson) : undefined
    const peerDiscovery = config.bridgeNode.bootstrapNodes.length ? [bootstrap({
      interval: 60e3, //fixme: what is this?
      enabled: true, list: config.bridgeNode.bootstrapNodes
    }),] : undefined
    this.p2p = await createLibp2p({
      peerId,
      addresses: {listen: [`/ip4/${this.ip}/tcp/${this.port}`]},
      transports: [tcp()],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      connectionManager: {inboundConnectionThreshold: 25, /*Default is 5*/},
      services: {
        ping: ping({protocolPrefix: 'reactor'}), pubsub: gossipsub(), identify: identify(),
        dht: kadDHT({protocol: '/reactor/lan/kad/1.0.0', peerInfoMapper: config.bridgeNode.isPublic ? removePrivateAddressesMapper : removePublicAddressesMapper, clientMode: false}),
        nat: autoNAT({
          protocolPrefix: 'reactor', // this should be left as the default value to ensure maximum compatibility
          timeout: 30000, // the remote must complete the AutoNAT protocol within this timeout
          maxInboundStreams: 1, // how many concurrent inbound AutoNAT protocols streams to allow on each connection
          maxOutboundStreams: 1 // how many concurrent outbound AutoNAT protocols streams to allow on each connection
        })
      },
      peerDiscovery
    })

    this.p2p.addEventListener('peer:connect', this.peerConnected.bind(this))
    this.p2p.addEventListener('peer:discovery', this.peerDiscovered.bind(this))
    return this
  }

  async start() {
    await this.p2p.start()
    return this
  }

  async stop() {
    await this.p2p.stop()
    for (const stream of Object.values(this.streams)) await stream.close()
    return this
  }

  async connect(peerId) {
    await this.p2p.dial(peerIdFromString(peerId))
    return this
  }

  findPeer(peerId) { return this.p2p.peerRouting.findPeer(peerIdFromString(peerId)) }

  peerDiscovered(evt) {
    const {detail: peer} = evt
    //console.log("Peer", peer, " Discovered By", this.p2p.peerId)
  }

  //fixme: remove this peer from the network
  peerConnected(evt) {
    const peerId = evt.detail.toString()
    // console.log(peerId, "connected with", this.p2p.peerId)
    // if (!this.knownPeers[peerId]) {
    //   console.log('remove this peer from the network')
    //   // this.p2p.hangUp(peerId)
    // }
  }

  // pubsub connection
  async connectPubSub(peerId, handler) {
    this.p2p.services.pubsub.addEventListener('message', message => {
      const {from: peerId, topic, data, signature} = message.detail
      // fixme: signature verification
      handler({peerId: peerId.toString(), topic, data: new TextDecoder().decode(data)})
    })
    await this.p2p.services.pubsub.connect(peerId)
  }

  async subscribe(topic) { await this.p2p.services.pubsub.subscribe(topic)}

  async publish(topic, data) { await this.p2p.services.pubsub.publish(topic, new TextEncoder().encode(data)) }

  // p2p connection
  async createAndSendMessage(peerId, protocol, message, responseHandler) {
    console.log('Sending', topic, peerId, message)
    let stream = await this.createStream(peerId, protocol)
    await this.sendMessageOnStream(stream, message)
    await this.readStream(stream, responseHandler)
    return stream
  }

  async createStream(peerId, protocol) {
    if (this.streams[protocol]) this.streams[protocol].close()
    let stream = await tryAgainIfError(_ => this.p2p.dialProtocol(peerIdFromString(peerId), protocol))
    this.streams[protocol] = stream
    return stream
  }

  async sendMessageOnStream(stream, message) {
    return stream.sink([uint8ArrayFromString(message)])
  }

  async readStream(stream, handler) {

    pipe(stream.source, (source) => map(source, (buf) => uint8ArrayToString(buf.subarray())), async (source) => {
      for await (const msg of source) handler(msg)
    })
  }

  registerStreamHandler(protocol, handler) {
    this.p2p.handle(protocol, async ({stream, connection: {remotePeer}}) => {
      pipe(stream.source, (source) => map(source, (buf) => uint8ArrayToString(buf.subarray())), async (source) => {
        for await (const msg of source) handler(stream, remotePeer.string, msg)
      })
    })
  }

  // implement ping pong between nodes to maintain status
  async ping(peerId) { return await this.p2p.services.ping.ping(peerIdFromString(peerId)) }
}