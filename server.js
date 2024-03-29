const webrtc = require("wrtc");
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const express = require('express');
const app = express();

app.use(express.static('public'));
// based on examples at https://www.npmjs.com/package/ws 
const WebSocketServer = WebSocket.Server;

const privateKey = fs.readFileSync(process.env.keyFile || "nolshimung-key.pem");
const certificate = fs.readFileSync(process.env.certFile || "nolshimung.pem");
let serverOptions = {
    listenPort: 3005,
    useHttps: true,
    // httpsCertFile: '/home/ubuntu/simple_sfu/ssl/cert/ssl.crt',
    // httpsKeyFile: '/home/ubuntu/simple_sfu/ssl/key/ssl.key',
    httpsCertFile: process.env.certFile || "nolshimung.pem",
    httpsKeyFile: process.env.keyFile || "nolshimung-key.pem"
};

let sslOptions = {};
if (serverOptions.useHttps) {
    sslOptions.key = fs.readFileSync(serverOptions.httpsKeyFile).toString();
    sslOptions.cert = fs.readFileSync(serverOptions.httpsCertFile).toString();
}

let webServer = null;
if (serverOptions.useHttps) {
    webServer = https.createServer(sslOptions, app);
    webServer.listen(serverOptions.listenPort);
} else {
    webServer = http.createServer(app);
    webServer.listen(serverOptions.listenPort);
}
let rooms = new Map();
let peers = new Map();
let consumers = new Map();

function handleTrackEvent(e, peer, ws, projectId) {
    if (e.streams && e.streams[0]) {
        rooms.get(projectId).get(peer).stream = e.streams[0];

        const payload = {
            type: 'newProducer',
            id: peer,
            username: rooms.get(projectId).get(peer).username
        }
        wss.broadcast(projectId, JSON.stringify(payload));
    }
}

function createPeer() {
    let peer = new webrtc.RTCPeerConnection({
        iceServers: [
            {
                urls: 'turn:3.34.53.247',
                username: 'admin',
                credential: 'jgjg1234'
            },
            // { urls: 'stun:stun01.sipphone.com' },
            // { urls: 'stun:stun.ekiga.net' },
            // { urls: 'stun:stun.fwdnet.net' },
            // { urls: 'stun:stun.ideasip.com' },
            // { urls: 'stun:stun.iptel.org' },
            // { urls: 'stun:stun.rixtelecom.se' },
            // { urls: 'stun:stun.schlund.de' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // { urls: 'stun:stunserver.org' },
            // { urls: 'stun:stun.softjoys.com' },
            // { urls: 'stun:stun.voiparound.com' },
            // { urls: 'stun:stun.voipbuster.com' },
            // { urls: 'stun:stun.voipstunt.com' },
            // { urls: 'stun:stun.voxgratia.org' },
            // { urls: 'stun:stun.xten.com' },
            // {
            //     urls: 'turn:numb.viagenie.ca',
            //     credential: 'muazkh',
            //     username: 'webrtc@live.com'
            // },
            // {
            //     urls: 'turn:192.158.29.39:3478?transport=udp',
            //     credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            //     username: '28224511:1379330808'
            // },
            // {
            //     urls: 'turn:192.158.29.39:3478?transport=tcp',
            //     credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            //     username: '28224511:1379330808'
            // }
        ]
    });

    return peer;
}

// Create a server for handling websocket calls
const wss = new WebSocketServer({ server: webServer },
  {
    cors: {
      origin: "*",
    },
  });


wss.on('connection', function (ws) {
    let peerId = uuidv4();
    ws.id = peerId;
    let projectId = ''
    ws.on('close', (event) => {
        rooms.forEach((value, key, obj) =>{
            if (value.get(ws.id)){
                rooms.get(key).delete(ws.id)
                consumers.delete(ws.id);
                projectId = key;
                return false;
            }
        })

        // peers.delete(ws.id);
        // getpeers.delete(ws.id);
        // consumers.delete(ws.id);

        wss.broadcast(projectId, JSON.stringify({
            type: 'user_left',
            id: ws.id
        }));
    });


    ws.send(JSON.stringify({ 'type': 'welcome', id: peerId }));
    ws.on('message', async function (message) {
        const body = JSON.parse(message);
        console.log(`메시지 : ${body.type}, 프로젝트 아이디 : ${body.projectId}`)

        switch (body.type) {
            case 'connect':
                // peers.set(body.uqid, { socket: ws });
                try{
                  let peers = new Map()
                  if (!rooms.get(body.projectId)) rooms.set(body.projectId, peers.set(body.uqid, { socket: ws }));
                  else rooms.get(body.projectId).set(body.uqid, { socket: ws })
                  const peer = createPeer();
                  // peers.get(body.uqid).username = body.username;
                  rooms.get(body.projectId).get(body.uqid).username = body.username;
                  // peers.get(body.uqid).peer = peer;
                  rooms.get(body.projectId).get(body.uqid).peer = peer;
                  peer.ontrack = (e) => { handleTrackEvent(e, body.uqid, ws, body.projectId) };
                  const desc = new webrtc.RTCSessionDescription(body.sdp);
                  await peer.setRemoteDescription(desc);
                  const answer = await peer.createAnswer();
                  await peer.setLocalDescription(answer);
                  console.log(`conn id : ${body.uqid}, conn projectId : ${body.projectId}`);
                  console.log(`connected, rooms : ${!rooms.get(body.projectId).get(body.uqid)}`)


                  const payload = {
                      type: 'answer',
                      sdp: peer.localDescription
                  }

                  ws.send(JSON.stringify(payload));
                }catch(e){
                  console.log(e);
                }
                break;
            case 'getPeers':
              try{
                let uuid = body.uqid;
                let projectId = body.projectId;
                const list = [];
                const getpeers = rooms.get(projectId);
                // console.log(getpeers)
                if (getpeers){
                    getpeers.forEach((peer, key) => {
                        if (key != uuid) {
                            const peerInfo = {
                                id: key,
                                username: peer.username,
                            }
                            list.push(peerInfo);
                        }
                    });
                }
                
                console.log(`getPeers : ${JSON.stringify(list)}`)
                const peersPayload = {
                    type: 'peers',
                    peers: list
                }

                ws.send(JSON.stringify(peersPayload));
              }catch(e){
                console.log(e);
              }
                
              break;
            case 'ice':
                console.log('ice 실제 : ', !rooms.get(body.projectId).get(body.uqid));
                const user = rooms.get(body.projectId).get(body.uqid);
                if (user.peer)
                    user.peer.addIceCandidate(new webrtc.RTCIceCandidate(body.ice)).catch(e => console.log(e));
                break;
            case 'consume':
                try {
                    let { id, sdp, consumerId } = body;
                    console.log(`projectId : ${body.projectId}, id : ${id}`)
                    console.log('xx: ', !(rooms.get(body.projectId)).get(id));
                    // if (!rooms.get(body.projectId).get(id)) return false;
                    const remoteUser = rooms.get(body.projectId).get(id);
                    console.log(`remote : ${remoteUser.stream}`);
                    const newPeer = createPeer();
                    consumers.set(consumerId, newPeer);
                    const _desc = new webrtc.RTCSessionDescription(sdp);
                    await consumers.get(consumerId).setRemoteDescription(_desc);

                    remoteUser.stream.getTracks().forEach(track => {
                        consumers.get(consumerId).addTrack(track, remoteUser.stream);
                    });
                    const _answer = await consumers.get(consumerId).createAnswer();
                    await consumers.get(consumerId).setLocalDescription(_answer);

                    const _payload = {
                        type: 'consume',
                        sdp: consumers.get(consumerId).localDescription,
                        username: remoteUser.username,
                        id,
                        consumerId
                    }

                    ws.send(JSON.stringify(_payload));
                } catch (error) {
                    console.log(error)
                }

                break;
            case 'consumer_ice':
                if (consumers.has(body.consumerId)) {
                    consumers.get(body.consumerId).addIceCandidate(new webrtc.RTCIceCandidate(body.ice)).catch(e => console.log(e));
                }
                break;
            default:
                wss.broadcast(body.projectId, message);

        }
    });

    ws.on('error', () => ws.terminate());
});

wss.broadcast = function (projectId, data) {
    if (rooms.get(projectId)){
        rooms.get(projectId).forEach(function (peer) {
            if (peer.socket.readyState === WebSocket.OPEN) {
                peer.socket.send(data);
            }
        });
    }
};

console.log('Server running.');
