import Node from '../src/Node.js'
const peerIdJson  = {
  privKey: 'CAESQK0/fGhAG26fRXLTxDyV7LpSreIfOXSJ+krI+BdTbeJq5/UphgwH8/mDsTa9HebrBuDJ6EtxNwnEAjEVyA/OQjU',
  pubKey: 'CAESIOf1KYYMB/P5g7E2vR3m6wbgyehLcTcJxAIxFcgPzkI1',
  id: '12D3KooWRRqAo5f41sQmc9BpsfqarZgd7PWUiX14Mz1htXDEc7Gp'
}

// const node = await new Node({ip: '51.159.143.255', port: 8080, isLeader: true, peerIdJson}).create()
const node = await new Node({ip: '0.0.0.0', port: 8080, isLeader: true, peerIdJson}).create()
await node.start()
setInterval( _=> node.publish('DepositHash', `love from leader ${Date.now()}`).catch(e=>{
  if(e.message !== 'PublishError.NoPeersSubscribedToTopic') console.log(e)
}), 1000)


