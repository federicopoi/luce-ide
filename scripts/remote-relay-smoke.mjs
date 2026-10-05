import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import net from 'node:net';
import {RemoteHost} from '../src/main/remote-host.cjs';
import {PhoneConnection,seal} from '../src/shared/remote-protocol.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const relayDir=path.join(root,'relay');
const temp=mkdtempSync(path.join(tmpdir(),'luce-relay-smoke-'));
const token=`local-${crypto.randomUUID()}`;
let child,host,phone;

function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
function waitForOutput(proc,matcher,timeout=30000){return new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error(`Wrangler did not become ready.\n${output}`)),timeout);const onData=chunk=>{output+=chunk.toString();if(matcher.test(output)){clearTimeout(timer);proc.stdout.off('data',onData);proc.stderr.off('data',onData);resolve(output);}};proc.stdout.on('data',onData);proc.stderr.on('data',onData);proc.once('exit',code=>{clearTimeout(timer);reject(new Error(`Wrangler exited (${code}).\n${output}`));});});}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitUntil(predicate,description,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await delay(20);}throw new Error(`Timed out waiting for ${description}.`);}
async function close(){phone?.close();host?.close();if(child&&!child.killed){child.kill('SIGTERM');await Promise.race([once(child,'exit'),delay(5000)]);if(!child.killed)child.kill('SIGKILL');}rmSync(temp,{recursive:true,force:true});}

try{
 const port=await freePort();
 const assets=path.resolve(relayDir,'../dist/mobile');if(!existsSync(assets))mkdirSync(assets,{recursive:true});
 child=spawn('wrangler',['dev','--local','--ip','127.0.0.1','--port',String(port),'--var',`REGISTRATION_TOKEN:${token}`,'--persist-to',path.join(temp,'persist')],{cwd:relayDir,stdio:['ignore','pipe','pipe'],env:{...process.env,NO_UPDATE_NOTIFIER:'1'}});
 await waitForOutput(child,/Ready on|Listening on|http:\/\/127\.0\.0\.1:/);
 const base=`http://127.0.0.1:${port}`;
 const rejected=await fetch(`${base}/api/hosts`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({registrationToken:'wrong'})});assert.equal(rejected.status,401,'enrollment must reject an invalid registration token');
 const foreignOrigin=await fetch(`${base}/api/hosts`,{method:'POST',headers:{'content-type':'application/json',origin:'https://invalid.example'},body:JSON.stringify({registrationToken:token})});assert.equal(foreignOrigin.status,403,'Worker must reject a foreign browser origin');
 const missingApi=await fetch(`${base}/api/does-not-exist`);assert.equal(missingApi.status,404,'API paths must reach the Worker before the SPA asset fallback');
 let mutations=0;host=new RemoteHost({directory:path.join(temp,'profile'),relayURL:base,registrationToken:token,request:async(method,params,context)=>{assert.equal(context.deviceId,pair.deviceId);mutations++;return {method,params};}});await host.enable();
 const pair=await host.createPair('Smoke phone');const encoded=new URL(pair.url).hash.slice('#pair='.length);const fragment=JSON.parse(Buffer.from(encoded,'base64url').toString());phone=new PhoneConnection(fragment);
 await phone.connect();await waitUntil(()=>host.status().devices[0]?.connected,'authenticated device handshake');
 const reply=await phone.request('write',{id:'terminal-1',data:'hello\n'});assert.equal(reply.method,'write');assert.equal(mutations,1);
 const previousSession=phone.session;phone.socket.close();await waitUntil(()=>!host.status().devices[0]?.connected,'device disconnect');await phone.connect();await waitUntil(()=>host.status().devices[0]?.connected,'fresh reconnect handshake');
 const replay=await seal(fragment.key,{kind:'request',id:'replayed-write',method:'write',params:{id:'terminal-1',data:'hello\n'},session:previousSession});phone.socket.send(JSON.stringify({type:'packet',packet:replay}));await delay(50);assert.equal(mutations,1,'replayed ciphertext from a prior host session must not rerun the mutation');
 const invalidSocket=new WebSocket(`${base.replace('http:','ws:')}/api/device/${fragment.hostId}/${fragment.deviceId}?auth=invalid`);const closeCode=await new Promise(resolve=>invalidSocket.addEventListener('close',event=>resolve(event.code),{once:true}));assert.ok([1002,1006].includes(closeCode),'invalid device credentials must be rejected during the websocket handshake');
 await host.revokeDevice(pair.deviceId);assert.equal(host.status().devices.length,0,'revocation must remove the device');
 console.log('Remote relay smoke passed: registration guard, origin guard, encrypted RPC, fresh reconnect handshake, replay rejection, invalid auth, and revocation.');
}catch(error){console.error(error);process.exitCode=1;}finally{await close();}
