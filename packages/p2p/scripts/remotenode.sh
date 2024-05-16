#!/usr/bin/env bash

#cd ../packages/p2p
#yarn docker:build
#cd ../../scripts

function startNode() {
  echo "Starting node..."
  ssh root@$EXTERNAL_IP "
  docker stop p2p-node$PORT
  docker rm p2p-node$PORT
  docker pull leverj/p2p:dev
  docker run -d --name p2p-node$PORT \
    -e EXTERNAL_IP=$EXTERNAL_IP \
    -e PORT=$PORT \
    -e BRIDGE_PORT=$BRIDGE_PORT \
    -e BRIDGE_IS_LEADER=$BRIDGE_IS_LEADER \
    -e BRIDGE_THRESHOLD=$BRIDGE_THRESHOLD \
    -e BRIDGE_BOOTSTRAP_NODE=$BRIDGE_BOOTSTRAP_NODE \
    -p $PORT:$PORT \
    -p $BRIDGE_PORT:$BRIDGE_PORT \
    -v /var/lib/reactor/data/$PORT:/dist/data \
    leverj/p2p:dev node app.js
  "
}

EXTERNAL_IP=51.159.143.255 PORT=9000 BRIDGE_PORT=10000 BRIDGE_IS_LEADER=true BRIDGE_THRESHOLD=3 BRIDGE_BOOTSTRAP_NODE=http://51.159.143.255:9000 startNode
EXTERNAL_IP=51.159.143.255 PORT=9001 BRIDGE_PORT=10001 BRIDGE_IS_LEADER=false BRIDGE_THRESHOLD=3 BRIDGE_BOOTSTRAP_NODE=http://51.159.143.255:9000 startNode
EXTERNAL_IP=51.15.25.144 PORT=9002 BRIDGE_PORT=10002 BRIDGE_IS_LEADER=false BRIDGE_THRESHOLD=3 BRIDGE_BOOTSTRAP_NODE=http://51.159.143.255:9000 startNode
EXTERNAL_IP=51.15.25.144 PORT=9003 BRIDGE_PORT=10003 BRIDGE_IS_LEADER=false BRIDGE_THRESHOLD=3 BRIDGE_BOOTSTRAP_NODE=http://51.159.143.255:9000 startNode
EXTERNAL_IP=51.15.25.144 PORT=9004 BRIDGE_PORT=10004 BRIDGE_IS_LEADER=false BRIDGE_THRESHOLD=3 BRIDGE_BOOTSTRAP_NODE=http://51.159.143.255:9000 startNode
#EXTERNAL_IP=192.168.1.69 PORT=9005 BRIDGE_PORT=10005 BRIDGE_IS_LEADER=false BRIDGE_THRESHOLD=4 BRIDGE_BOOTSTRAP_NODE=http://51.159.143.255:9000 startNode
#EXTERNAL_IP=192.168.1.69 PORT=9006 BRIDGE_PORT=10006 BRIDGE_IS_LEADER=false BRIDGE_THRESHOLD=4 BRIDGE_BOOTSTRAP_NODE=http://51.159.143.255:9000 startNode


#curl --location --request POST 'http://localhost:9000/api/dkg/start'

#curl --location 'http://localhost:9000/api/tss/aggregateSign' \\
#--header 'Content-Type: application/json' \
#--data '{
#    "txnHash": "hash123456",
#    "msg": "hello world"
#}'
#
