const encoder=new TextEncoder();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
async function sha(value){return b64url(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
function originAllowed(request){const origin=request.headers.get('origin');if(!origin)return true;try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}}

export default {
 async fetch(request,env){
  const url=new URL(request.url);if(url.pathname.startsWith('/api/')){
   if(!originAllowed(request))return json({error:'Origin rejected.'},403);
   try{
    if(url.pathname==='/api/hosts'&&request.method==='POST'){
     const body=await request.json();if(!env.REGISTRATION_TOKEN||body.registrationToken!==env.REGISTRATION_TOKEN)return json({error:'Invalid registration token.'},401);
     const hostId=crypto.randomUUID(),hostToken=b64url(crypto.getRandomValues(new Uint8Array(32))),stub=env.HOSTS.get(env.HOSTS.idFromName(hostId));
     const response=await stub.fetch('https://relay/internal/enroll',{method:'POST',body:JSON.stringify({hostHash:await sha(hostToken)})});if(!response.ok)return json({error:'Could not enroll host.'},500);
     return json({hostId,hostToken});
    }
    const match=url.pathname.match(/^\/api\/hosts\/([a-zA-Z0-9-]+)\/devices(?:\/([a-zA-Z0-9-]+))?$/);
    if(match){const [,hostId,deviceId]=match;const stub=env.HOSTS.get(env.HOSTS.idFromName(hostId));
     if(!deviceId&&request.method==='POST')return stub.fetch(new Request('https://relay/internal/devices',request));
     if(deviceId&&request.method==='DELETE')return stub.fetch(new Request(`https://relay/internal/devices/${deviceId}`,request));
     return json({error:'Not found.'},404);
    }
    const wsHost=url.pathname.match(/^\/api\/host\/([a-zA-Z0-9-]+)$/);if(wsHost){const stub=env.HOSTS.get(env.HOSTS.idFromName(wsHost[1]));const next=new Request(`https://relay/host?hostId=${encodeURIComponent(wsHost[1])}`,request);return stub.fetch(next);}
    const wsDevice=url.pathname.match(/^\/api\/device\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)$/);if(wsDevice){const stub=env.HOSTS.get(env.HOSTS.idFromName(wsDevice[1]));const next=new Request(`https://relay/device/${encodeURIComponent(wsDevice[2])}?${url.searchParams}`,request);return stub.fetch(next);}
    return json({error:'Not found.'},404);
   }catch(error){return json({error:String(error?.message||'Request failed.').slice(0,200)},400);}
  }
  // Always return the current deployment; conditional browser requests must not
  // reuse an older shell. The asset binding resolves immutable deployed bytes.
  const headers=new Headers(request.headers);headers.delete('if-none-match');headers.delete('if-modified-since');
  const asset=await env.ASSETS.fetch(new Request(request,{headers}));
  const response=new Response(asset.body,asset);response.headers.set('cache-control','no-store');response.headers.set('cdn-cache-control','no-store');response.headers.set('cloudflare-cdn-cache-control','no-store');
  for(const name of ['etag','last-modified','expires','cf-cache-status','age'])response.headers.delete(name);
  return response;
 }
};

export class HostRelay {
 constructor(state){this.state=state;this.storage=state.storage;this.hostHash=null;this.devices=null;this.host=null;this.sockets=new Map();this.initialized=false;}
 async init(){if(this.initialized)return;this.hostHash=await this.storage.get('hostHash')||null;this.devices=await this.storage.get('devices')||{};for(const socket of this.state.getWebSockets()){if(socket.readyState!==1)continue;const attachment=socket.deserializeAttachment();if(attachment?.role==='host')this.host=socket;else if(attachment?.role==='device'&&this.devices[attachment.deviceId])this.sockets.set(`device:${attachment.deviceId}`,socket);}this.initialized=true;}
 async fetch(request){await this.init();const url=new URL(request.url);
  if(url.pathname==='/internal/enroll'&&request.method==='POST'){const body=await request.json();this.hostHash=body.hostHash;await this.storage.put('hostHash',this.hostHash);return json({ok:true});}
  if(url.pathname.startsWith('/internal/devices')){const auth=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(!this.hostHash||await sha(auth)!==this.hostHash)return json({error:'Host authentication failed.'},401);
   if(url.pathname==='/internal/devices'&&request.method==='POST'){const body=await request.json();if(!/^[a-zA-Z0-9-]{8,80}$/.test(body.deviceId||'')||typeof body.token!=='string'||body.token.length>200)return json({error:'Invalid device credentials.'},400);if(!this.devices[body.deviceId]&&Object.keys(this.devices).length>=32)return json({error:'This host already has 32 paired devices.'},429);this.devices[body.deviceId]={hash:await sha(body.token),name:String(body.name||'Phone').slice(0,80),createdAt:body.createdAt};await this.storage.put('devices',this.devices);return json({ok:true});}
   if(url.pathname.startsWith('/internal/devices/')&&request.method==='DELETE'){const id=url.pathname.split('/').at(-1);delete this.devices[id];await this.storage.put('devices',this.devices);this.sockets.get(`device:${id}`)?.close(4001,'Device revoked');return json({ok:true});}return json({error:'Not found.'},404);}
  if(url.pathname==='/host'&&request.headers.get('Upgrade')==='websocket')return this.acceptHost(request,url);
  const match=url.pathname.match(/^\/device\/([a-zA-Z0-9-]+)$/);if(match&&request.headers.get('Upgrade')==='websocket')return this.acceptDevice(request,match[1],url);
  return json({error:'Not found.'},404);
 }
 webSocketMessage(socket,message){return this.init().then(()=>{const attachment=socket.deserializeAttachment();if(attachment?.role==='host')this.fromHost(socket,message);else if(attachment?.role==='device')this.fromDevice(attachment.deviceId,socket,message);}).catch(()=>socket.close(1011,'Relay initialization failed'));}
 webSocketClose(socket){return this.init().then(()=>{const attachment=socket.deserializeAttachment();if(attachment?.role==='host'&&(this.host===socket||!this.host)){if(this.host===socket)this.host=null;for(const device of this.sockets.values())if(device.readyState===1)device.send(JSON.stringify({type:'status',connected:false}));}else if(attachment?.role==='device'){const key=`device:${attachment.deviceId}`;if(this.sockets.get(key)===socket||!this.sockets.has(key)){if(this.sockets.get(key)===socket)this.sockets.delete(key);if(this.host?.readyState===1)this.host.send(JSON.stringify({type:'device-disconnected',deviceId:attachment.deviceId}));}}});}
 webSocketError(socket){return this.init().then(()=>{try{socket.close(1011,'Relay socket error');}catch{}});}
 async acceptHost(request,url){if(!this.hostHash||await sha(request.headers.get('authorization')?.replace(/^Bearer /,'')||'')!==this.hostHash)return json({error:'Host authentication failed.'},401);const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.serializeAttachment({role:'host'});this.state.acceptWebSocket(server,['host']);this.host?.close(4000,'Host reconnected');this.host=server;for(const [key,socket] of this.sockets)if(key.startsWith('device:')&&socket.readyState===1){socket.send(JSON.stringify({type:'status',connected:true}));server.send(JSON.stringify({type:'device-connected',deviceId:key.slice(7)}));}return new Response(null,{status:101,webSocket:client});}
 async acceptDevice(request,id,url){const device=this.devices[id];if(!device||await sha(url.searchParams.get('auth')||'')!==device.hash)return json({error:'Device authentication failed.'},401);const pair=new WebSocketPair(),client=pair[0],server=pair[1],key=`device:${id}`;server.serializeAttachment({role:'device',deviceId:id});this.state.acceptWebSocket(server,[`device:${id}`,'device']);this.sockets.get(key)?.close(4000,'Device reconnected');this.sockets.set(key,server);server.send(JSON.stringify({type:'status',connected:!!this.host}));if(this.host?.readyState===1)this.host.send(JSON.stringify({type:'device-connected',deviceId:id}));return new Response(null,{status:101,webSocket:client});}
 fromDevice(id,socket,data){if(socket.readyState!==1||this.host?.readyState!==1)return;const text=typeof data==='string'?data:new TextDecoder().decode(data);if(text.length>10*1024*1024){socket.close(1009,'Message too large');return;}let frame;try{frame=JSON.parse(text);}catch{socket.close(1007,'Malformed message');return;}if(frame.type!=='packet'||!frame.packet||typeof frame.packet.nonce!=='string'||typeof frame.packet.ciphertext!=='string'){socket.close(1007,'Malformed packet');return;}if(this.host.bufferedAmount>20*1024*1024){socket.close(1013,'Relay backpressure');return;}this.host.send(JSON.stringify({type:'packet',deviceId:id,packet:frame.packet}));}
 fromHost(socket,data){if(socket!==this.host||socket.readyState!==1)return;const text=typeof data==='string'?data:new TextDecoder().decode(data);if(text.length>10*1024*1024){socket.close(1009,'Message too large');return;}let frame;try{frame=JSON.parse(text);}catch{socket.close(1007,'Malformed message');return;}if(frame.type==='close-device'){if(typeof frame.deviceId!=='string'||!this.devices[frame.deviceId])return;this.sockets.get(`device:${frame.deviceId}`)?.close(1013,'Relay queue limit');return;}if(frame.type!=='packet'||!this.devices[frame.deviceId]||!frame.packet||typeof frame.packet.nonce!=='string'||typeof frame.packet.ciphertext!=='string'){socket.close(1007,'Malformed packet');return;}const device=this.sockets.get(`device:${frame.deviceId}`);if(device?.readyState===1){if(device.bufferedAmount>20*1024*1024){device.close(1013,'Relay backpressure');return;}device.send(JSON.stringify({type:'packet',packet:frame.packet}));}}
}
