const {test}=require('node:test');
const assert=require('node:assert/strict');

class FakeWebSocket {
 constructor(){this.readyState=0;this.listeners=new Map();this.sent=[];queueMicrotask(()=>{this.readyState=1;this.dispatch('open',{});});}
 addEventListener(name,callback){const list=this.listeners.get(name)||new Set();list.add(callback);this.listeners.set(name,list);}
 removeEventListener(name,callback){this.listeners.get(name)?.delete(callback);}
 dispatch(name,event){for(const callback of this.listeners.get(name)||[])callback(event);}
 send(value){this.sent.push(value);}
 close(code=1000,reason=''){this.closeCode=code;this.closeReason=reason;this.readyState=3;this.dispatch('close',{code,reason});}
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate){for(let i=0;i<200;i++){if(predicate())return;await delay(2);}throw new Error('Timed out waiting for protocol event.');}

test('PhoneConnection decrypts incoming events in socket order and bounds its receive queue',async()=>{
 const originalWebSocket=global.WebSocket;
 const subtle=crypto.subtle,originalDecrypt=subtle.decrypt.bind(subtle);
 const descriptor=Object.getOwnPropertyDescriptor(subtle,'decrypt');
 let delayNext=false;
 global.WebSocket=FakeWebSocket;
 Object.defineProperty(subtle,'decrypt',{configurable:true,value:async(...args)=>{if(delayNext){delayNext=false;await delay(40);}return originalDecrypt(...args);}});
 try{
  const {PhoneConnection,seal}=await import('../src/shared/remote-protocol.mjs');
  const key=crypto.getRandomValues(new Uint8Array(32));
  const keyText=Buffer.from(key).toString('base64url');
  const phone=new PhoneConnection({relayURL:'https://relay.example',hostId:'host',deviceId:'device',key:keyText});
  await phone.connect();
  const socket=phone.socket;
  const challenge=await seal(key,{kind:'challenge',nonce:'fresh-session'});
  socket.dispatch('message',{data:JSON.stringify({type:'packet',packet:challenge})});
  await waitFor(()=>phone.session==='fresh-session');
  const seen=[];phone.onEvent('terminal-data',value=>seen.push(value.offset));
  const large=await seal(key,{kind:'event',event:'terminal-data',value:{offset:1,padding:'x'.repeat(10000)},session:'fresh-session'});
  const small=await seal(key,{kind:'event',event:'terminal-data',value:{offset:2},session:'fresh-session'});
  delayNext=true;
  socket.dispatch('message',{data:JSON.stringify({type:'packet',packet:large})});
  socket.dispatch('message',{data:JSON.stringify({type:'packet',packet:small})});
  await waitFor(()=>seen.length===2);
  assert.deepEqual(seen,[1,2],'async AES-GCM completion must not reorder terminal events');

  for(let i=0;i<65;i++)socket.dispatch('message',{data:JSON.stringify({type:'packet',packet:small})});
  assert.equal(socket.closeCode,4000,'phone must close an overflowing per-socket receive queue');
  phone.close();
 }finally{
  global.WebSocket=originalWebSocket;
  if(descriptor)Object.defineProperty(subtle,'decrypt',descriptor);else delete subtle.decrypt;
 }
});

test('PhoneConnection times out uncertain requests and resets the stale socket',async()=>{
 const originalWebSocket=global.WebSocket;global.WebSocket=FakeWebSocket;
 try{
  const {PhoneConnection,seal}=await import('../src/shared/remote-protocol.mjs');
  const key=crypto.getRandomValues(new Uint8Array(32));const phone=new PhoneConnection({relayURL:'https://relay.example',hostId:'host',deviceId:'device',key:Buffer.from(key).toString('base64url'),requestTimeoutMs:25});
  await phone.connect();const socket=phone.socket;const challenge=await seal(key,{kind:'challenge',nonce:'timeout-session'});socket.dispatch('message',{data:JSON.stringify({type:'packet',packet:challenge})});await waitFor(()=>phone.session==='timeout-session');
  await assert.rejects(phone.request('write',{id:'term',data:'change'}),/may have been sent; check the terminal before retrying/);
  assert.equal(phone.socket,null,'a timed-out response must reset the potentially stale transport');
  assert.equal(socket.closeCode,4001);
  assert.equal(phone.pending.size,0);
 }finally{global.WebSocket=originalWebSocket;}
});

test('PhoneConnection enforces the pending limit after concurrent handshake waiters resume',async()=>{
 const originalWebSocket=global.WebSocket;global.WebSocket=FakeWebSocket;
 try{
  const {PhoneConnection,seal}=await import('../src/shared/remote-protocol.mjs');
  const key=crypto.getRandomValues(new Uint8Array(32));const phone=new PhoneConnection({relayURL:'https://relay.example',hostId:'host',deviceId:'device',key:Buffer.from(key).toString('base64url'),requestTimeoutMs:5000});
  await phone.connect();const socket=phone.socket;
  const requests=Array.from({length:65},(_,index)=>phone.request('state',{index}).then(()=>null,error=>error));
  assert.equal(phone.pending.size,0,'all calls are still waiting for the challenge');
  const challenge=await seal(key,{kind:'challenge',nonce:'concurrent-session'});socket.dispatch('message',{data:JSON.stringify({type:'packet',packet:challenge})});
  await waitFor(()=>requests[64]&&phone.pending.size===64);
  const last=await requests[64];assert.match(last.message,/Too many pending remote requests/);
  assert.equal(phone.pending.size,64,'the post-handshake recheck must prevent a sixty-fifth pending call');
  await waitFor(()=>socket.sent.length===65,'all 64 requests and the handshake response must be sent');
  phone.close();await Promise.all(requests.slice(0,64));
 }finally{global.WebSocket=originalWebSocket;}
});
