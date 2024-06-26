// Define custom environment variables for the p2p module
module.exports = {
  externalIp: 'EXTERNAL_IP',
  port: 'PORT',
  ip: 'IP',
  timeout: {__name: 'TIMEOUT', __format: 'number'},
  tryCount: {__name: 'TRY_COUNT', __format: 'number'},
  bridgeNode: {
    isPublic: {__name: 'BRIDGE_IS_PUBLIC', __format: 'boolean'},
    confDir: 'BRIDGE_CONF_DIR',
    port: 'BRIDGE_PORT',
    isLeader: {__name: 'BRIDGE_IS_LEADER', __format: 'boolean'},
    threshold: {__name: 'BRIDGE_THRESHOLD', __format: 'number'},
    bootstrapNode: 'BRIDGE_BOOTSTRAP_NODE',
    bootstrapNodes: {__name: 'BRIDGE_BOOTSTRAP_NODES', __format: 'json'}
  }
}