const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {WebSocketServer}=require('ws');
const {RemoteHost}=require('../src/main/remote-host.cjs');

async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;}
const waitFor=(emitter,event,timeout=2000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Timed out waiting for ${event}`)),timeout);emitter.once(event,value=>{clearTimeout(timer);resolve(value);});});

test('RemoteHost pairs a phone, relays encrypted RPC/events, and revokes the device',async t=>{
 const {PhoneConnection,seal}=await import('../src/shared/remote-protocol.mjs');
 const hostDir=fs.mkdtempSync(path.join(os.tmpdir(),'luce-remote-'));
 const devices=new Map(),deviceSockets=new Map(),devicePackets=[],closeRequested=new Set();let hostSocket;
 let remote;
 const server=http.createServer((req,res)=>{
  let body='';req.on('data',part=>body+=part);req.on('end',()=>{
   const json=body?JSON.parse(body):{};res.setHeader('content-type','application/json');
   if(req.url==='/api/hosts'&&req.method==='POST'){res.end(JSON.stringify({hostId:'host-1',hostToken:'host-token'}));return;}
   if(req.url==='/api/hosts/host-1/devices'&&req.method==='POST'){devices.set(json.deviceId,json.token);res.end('{}');return;}
   if(req.url.startsWith('/api/hosts/host-1/devices/')&&req.method==='DELETE'){const id=req.url.split('/').at(-1);devices.delete(id);deviceSockets.get(id)?.close(4001,'Device revoked');res.end('{}');return;}
   res.statusCode=404;res.end('{}');
  });
 });
 const wss=new WebSocketServer({noServer:true});server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://local');
   wss.handleUpgrade(req,socket,head,ws=>{
   if(url.pathname==='/api/host/host-1'){hostSocket=ws;ws.on('message',raw=>{
    const frame=JSON.parse(String(raw));if(frame.type==='packet')deviceSockets.get(frame.deviceId)?.send(JSON.stringify({type:'packet',packet:frame.packet}));else if(frame.type==='close-device'){closeRequested.add(frame.deviceId);deviceSockets.get(frame.deviceId)?.close(1013,'Relay queue limit');}
   });}
   else if(url.pathname.startsWith('/api/device/')){const id=url.pathname.split('/').at(-1);ws.deviceId=id;deviceSockets.set(id,ws);ws.send(JSON.stringify({type:'status',connected:true}));hostSocket?.send(JSON.stringify({type:'device-connected',deviceId:id}));ws.on('message',raw=>{const frame=JSON.parse(String(raw));devicePackets.push(frame.packet);hostSocket?.send(JSON.stringify({...frame,deviceId:id}));});ws.on('close',()=>deviceSockets.delete(id));}
  });
 });
 const base=await listen(server);t.after(async()=>{remote?.close();for(const c of wss.clients)c.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));fs.rmSync(hostDir,{recursive:true,force:true});});
 let requests=0;
 const callbackOrder=[];
 remote=new RemoteHost({directory:hostDir,relayURL:base,registrationToken:'local-registration-token',request:async(method,params,{deviceId})=>{requests++;if(method==='slow')await new Promise(resolve=>setTimeout(resolve,80));if(method==='ordered')callbackOrder.push(params.order);return {method,params,deviceId};}});
 await remote.enable();
 const pair=await remote.createPair('iPhone');
 assert.match(pair.url,new RegExp(`#pair=`));assert.equal(remote.status().devices[0].name,'iPhone');
 assert.equal(fs.statSync(path.join(hostDir,'remote-host.json')).mode&0o777,0o600,'pairing credentials must be private');
 assert.equal(Object.hasOwn(remote.status().devices[0],'key'),false,'status must not expose pairing keys');
 const fragment=JSON.parse(Buffer.from(new URL(pair.url).hash.slice('#pair='.length),'base64url').toString());
 const client=new PhoneConnection(fragment);
 const connected=waitFor(remote,'phone-connected');
 await client.connect();
 await connected;
 const state=await client.request('state',{});assert.equal(state.method,'state');assert.equal(requests,1);
 const firstRequestPacket=devicePackets[1];
 const noticePromise=new Promise(resolve=>client.onEvent('notice',resolve));
 remote.publish('notice',{message:'hello'});
 const notice=await noticePromise;assert.equal(notice.message,'hello');
 const outputOrder=[];client.onEvent('terminal-data',value=>outputOrder.push(value.offset));
 for(let offset=1;offset<=20;offset++)remote.publish('terminal-data',{id:'term-1',data:'x',offset});
 for(let i=0;i<200&&outputOrder.length<20;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.deepEqual(outputOrder,Array.from({length:20},(_,i)=>i+1),'terminal output events must preserve send order');
 const originalSendDevice=remote.sendDevice.bind(remote);
 remote.sendDevice=(id,value)=>value.event==='terminal-data'?Promise.reject(new Error('simulated outbound queue overflow')):originalSendDevice(id,value);
 const resyncPromise=new Promise(resolve=>client.onEvent('terminal-resync',resolve));
 remote.publish('terminal-data',{id:'term-last',data:'dropped',offset:99});
 const resync=await Promise.race([resyncPromise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('missing terminal resync event')),500))]);
 assert.deepEqual(resync,{id:'term-last'},'a dropped final output chunk must request a fresh terminal snapshot');
 remote.sendDevice=originalSendDevice;
 await Promise.all(Array.from({length:20},(_,order)=>client.request('ordered',{order})));
 assert.deepEqual(callbackOrder,Array.from({length:20},(_,i)=>i),'concurrent phone requests must preserve their send order');
 const beforeDuplicate=requests;
 const duplicate=await seal(fragment.key,{kind:'request',id:'duplicate-mutation',method:'slow',params:{},session:client.session,sequence:++client.sequence});
 client.socket.send(JSON.stringify({type:'packet',packet:duplicate}));client.socket.send(JSON.stringify({type:'packet',packet:duplicate}));
 for(let i=0;i<100&&requests<beforeDuplicate+1;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(requests,beforeDuplicate+1,'simultaneous copies of one request ID must invoke the owner callback once');
 for(let i=0;i<260;i++)await client.request('state',{index:i});
 const completedRequests=requests;
 client.socket.send(JSON.stringify({type:'packet',packet:firstRequestPacket}));
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(requests,completedRequests,'an old request must stay consumed after the response cache evicts it');
 const oldSession=client.session;
 client.socket.close();
 for(let i=0;i<100&&remote.status().devices[0].connected;i++)await new Promise(resolve=>setTimeout(resolve,10));
 await client.connect();
 for(let i=0;i<100&&!remote.status().devices[0].connected;i++)await new Promise(resolve=>setTimeout(resolve,10));
 const stale=await seal(fragment.key,{kind:'request',id:'stale-replay',method:'state',params:{},session:oldSession});
 client.socket.send(JSON.stringify({type:'packet',packet:stale}));
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(requests,completedRequests,'a request from the prior host connection must not execute again');
 await assert.rejects(remote.receive('{malformed outer frame'),/JSON|Unexpected/,'malformed relay frames must reject through a Promise instead of throwing inside the WebSocket callback');
 const flood=JSON.stringify({type:'packet',deviceId:pair.deviceId,packet:firstRequestPacket});
 await Promise.allSettled(Array.from({length:65},()=>remote.receive(flood)));
 assert.ok(closeRequested.has(pair.deviceId),'overflowing the admission queue must ask the relay to close that phone socket');
 assert.ok((remote.admissions.get(pair.deviceId)?.count||0)<=64,'per-device inbound frame queue must remain bounded');
 assert.equal(requests,completedRequests,'queued stale frames must not mutate terminal state');
 const deviceId=pair.deviceId;
 await remote.revokeDevice(deviceId);
 assert.equal(remote.status().devices.length,0);
 for(let i=0;i<200&&client.socket;i++)await new Promise(resolve=>setTimeout(resolve,10));
 await assert.rejects(client.request('state',{}),/closed|revok|connect/i);
 const previousHostSocket=remote.socket;
 const previousClose=previousHostSocket.listeners('close').at(-1);
 await remote.disable();await remote.enable();
 const currentHostSocket=remote.socket;
 remote.connected.add('new-phone');remote.sessions.set('new-phone',{nonce:'new-session',ready:true});
 previousClose();
 assert.equal(remote.socket,currentHostSocket,'a stale close callback must not clear the replacement socket');
 assert.ok(remote.connected.has('new-phone'),'a stale close callback must not clear the replacement connection state');
 assert.equal(remote.sessions.get('new-phone')?.nonce,'new-session','a stale close callback must not clear the replacement session');
 client.close();await remote.close();
});

test('RemoteHost retries an initial connection failure and permits enable after cancelling a pending connect',async t=>{
 const hostDir=fs.mkdtempSync(path.join(os.tmpdir(),'luce-remote-reconnect-'));
 const server=http.createServer();const wss=new WebSocketServer({noServer:true});let upgrades=0;let heldUpgrade=null;
 server.on('upgrade',(req,socket,head)=>{
  upgrades++;
  if(upgrades===1){socket.destroy();return;}
  if(upgrades===3){heldUpgrade={req,socket,head};return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 const base=await listen(server);
 const fetchImpl=async()=>({ok:true,status:200,json:async()=>({hostId:'host-reconnect',hostToken:'host-token'})});
 const remote=new RemoteHost({directory:hostDir,relayURL:base,registrationToken:'registration',fetchImpl,request:async()=>null});
 t.after(async()=>{remote.close();for(const c of wss.clients)c.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));fs.rmSync(hostDir,{recursive:true,force:true});});

 await assert.rejects(remote.enable(),/connect|closed|socket/i,'the first connection should fail before its upgrade completes');
 for(let i=0;i<300&&!remote.status().connected;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(remote.status().connected,'a failed first connection must schedule automatic recovery');
 assert.equal(upgrades,2);

 const currentSocket=remote.socket;
 const disconnected=waitFor(currentSocket,'close');currentSocket.close();await disconnected;
 const pending=remote.openSocket().catch(error=>error);
 for(let i=0;i<200&&upgrades<3;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(upgrades,3,'the test must hold an in-flight replacement connection');
 await remote.disable();
 const reenabled=remote.enable();
 await reenabled;
 assert.ok(remote.status().connected,'enable must create a new attempt after cancelling a pending connection');
 assert.notEqual(remote.socket,currentSocket);
 await pending;
 if(heldUpgrade){heldUpgrade.socket.destroy();heldUpgrade=null;}
});
