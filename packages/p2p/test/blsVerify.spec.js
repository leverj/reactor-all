import {expect} from 'expect'
import {deployContract, getSigners, createDkgMembers, signMessage} from './help/index.js'
import bls from '../src/bls.js'
import * as mcl from '../src/mcl/mcl.js'
import {deserializeHexStrToG1, deserializeHexStrToG2} from 'mcl-wasm'
import {stringToHex} from '../src/mcl/mcl.js'
import {createApiNodes, createFrom, createInfo_json, deleteInfoDir, getInfo, getPublicKey, getWhitelists, killChildProcesses, publishWhitelist, startDkg, stop, waitForWhitelistSync} from './help/e2e.js'


const messageString = 'hello world'
describe('blsVerify', () => {
  let contract, L1DepositContract, owner, anyone
  before(async () => {
    await mcl.init()
  })
  beforeEach(async () => {
    [owner, anyone] = await getSigners()
    contract = await deployContract('BlsVerify', [])
    L1DepositContract = await deployContract('L1Deposit', [])
  })

  it.skip('deposit on L1 and listen on emitted event', async function(){
    const tx = await L1DepositContract.deposit(20)
    console.log(tx)
    const receipt = await tx.wait()
    const allNodes = [9000, 9001, 9002, 9003]
    await createInfo_json(allNodes.length)

    await createApiNodes(allNodes.length)
    // await setTimeout(2000)
    const txnHash = 'hash123456' //Get this from above event receipt
    await axios.post('http://localhost:9000/api/tss/aggregateSign', {txnHash, 'msg': message})
    const fn = async () => {
      const {data: {verified}} = await axios.get('http://localhost:9000/api/tss/aggregateSign?txnHash=' + txnHash)
      return verified
    }
    await waitToSync([fn], 200)
    const {data: {verified}} = await axios.get('http://localhost:9000/api/tss/aggregateSign?txnHash=' + txnHash)
    expect(verified).toEqual(true)
    
  })
  it('verify single signature', async function () {
    // mcl.setMappingMode(mcl.MAPPING_MODE_TI)
    // mcl.setDomain('testing evmbls')
    const message = mcl.stringToHex(messageString)
    const {pubkey, secret} = mcl.newKeyPair()
    const {signature, M} = mcl.sign(message, secret)
    let sig_ser = mcl.g1ToBN(signature)
    let pubkey_ser = mcl.g2ToBN(pubkey)
    let message_ser = mcl.g1ToBN(M)

    let res = await contract.verifySignature(sig_ser, pubkey_ser, message_ser)
    expect(res).toEqual(true)
  })

  it('should verify signature from dkgnodes', async function () {
    const threshold = 4
    const members = await createDkgMembers([10314, 30911, 25411, 8608, 31524, 15441, 23399], threshold)
    const {signs, signers} = signMessage(messageString, members)
    const groupsSign = new bls.Signature()
    groupsSign.recover(signs, signers)


    const signatureHex = groupsSign.serializeToHexStr()
    const pubkeyHex = members[0].groupPublicKey.serializeToHexStr()
    const M = mcl.hashToPoint(messageString)

    const signature = deserializeHexStrToG1(signatureHex)
    const pubkey = deserializeHexStrToG2(pubkeyHex)
    let message_ser = mcl.g1ToBN(M)
    let pubkey_ser = mcl.g2ToBN(pubkey)
    let sig_ser = mcl.g1ToBN(signature)
    let res = await contract.verifySignature(sig_ser, pubkey_ser, message_ser)
    expect(res).toEqual(true)
  })

  it('should be able to convert message to point', async function () {
    let res = await contract.hashToPoint(stringToHex('testing evmbls'), stringToHex(messageString))
    let fromJs = mcl.g1ToBN(mcl.hashToPoint(messageString))
    // console.log('from js', fromJs)
    // console.log('from contract', res)
    expect(res).toEqual(fromJs)
  })
})
