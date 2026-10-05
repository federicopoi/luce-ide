const {test}=require('node:test');
const assert=require('node:assert/strict');

class MockSocket {
 constructor(){this.readyState=1;this.sent=[];this.attachment=null;}
 serializeAttachment(value){this.attachment=structuredClone(value);}
 deserializeAttachment(){return structuredClone(this.attachment);}
 send(value){this.sent.push(value);}
 close(){this.readyState=3;}
}
class MockPair {constructor(){this[0]=new MockSocket();this[1]=new MockSocket();}}
class MockResponse {constructor(body,init={}){this.body=body;this.status=init.status||200;this.webSocket=init.webSocket;this.ok=this.status>=200&&this.status<300;}}
async function sha(value){return Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');}

test('Durable Object recovers tagged host/device sockets after hibernation',async()=>{
 const originalPair=global.WebSocketPair,originalResponse=global.Response;
 global.WebSocketPair=MockPair;global.Response=MockResponse;
 try{
  const {HostRelay}=await import('../relay/src/index.js');
  const sockets=[];const values=new Map([['hostHash',await sha('host-secret')],['devices',{'device-12345678':{hash:await sha('device-secret'),name:'Phone'}}]]);
  const state={storage:{get:async key=>values.get(key),put:async(key,value)=>values.set(key,value)},acceptWebSocket:(socket,tags)=>{socket.tags=tags;sockets.push(socket);},getWebSockets:tag=>sockets.filter(socket=>!tag||socket.tags.includes(tag))};
  const first=new HostRelay(state);
  await first.fetch(new Request('https://relay/host?hostId=host-12345678',{headers:{upgrade:'websocket',authorization:'Bearer host-secret'}}));
  await first.fetch(new Request('https://relay/device/device-12345678?auth=device-secret',{headers:{upgrade:'websocket'}}));
  assert.deepEqual(sockets.map(socket=>socket.attachment).sort((a,b)=>a.role.localeCompare(b.role)),[{role:'device',deviceId:'device-12345678'},{role:'host'}]);
  const deviceSocket=sockets.find(socket=>socket.deserializeAttachment().role==='device');
  const hostSocket=sockets.find(socket=>socket.deserializeAttachment().role==='host');
  const restored=new HostRelay(state);
  await restored.fetch(new Request('https://relay/no-route'));
  await restored.webSocketMessage(deviceSocket,JSON.stringify({type:'packet',packet:{nonce:'n',ciphertext:'from-phone'}}));
  await restored.webSocketMessage(hostSocket,JSON.stringify({type:'packet',deviceId:'device-12345678',packet:{nonce:'n2',ciphertext:'from-host'}}));
  assert.equal(JSON.parse(hostSocket.sent.at(-1)).packet.ciphertext,'from-phone');
  assert.equal(JSON.parse(deviceSocket.sent.at(-1)).packet.ciphertext,'from-host');
  hostSocket.close();
  const restoredOnClose=new HostRelay(state);
  await restoredOnClose.webSocketClose(hostSocket,1000,'closed',true);
  assert.deepEqual(JSON.parse(deviceSocket.sent.at(-1)),{type:'status',connected:false},'the first event after eviction must hydrate remaining phones before notifying them the host is offline');
 }finally{global.WebSocketPair=originalPair;global.Response=originalResponse;}
});
