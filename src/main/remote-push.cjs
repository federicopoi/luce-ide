const fs=require('node:fs');const path=require('node:path');const webPush=require('web-push');
function validateSubscription(s){if(!s||typeof s!=='object'||typeof s.endpoint!=='string'||s.endpoint.length>4096||!s.keys||typeof s.keys.auth!=='string'||typeof s.keys.p256dh!=='string'||s.keys.auth.length>128||s.keys.p256dh.length>256)throw Error('Invalid push subscription.');const u=new URL(s.endpoint);const host=u.hostname;if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!(host==='fcm.googleapis.com'||host.endsWith('.push.apple.com')||host==='updates.push.services.mozilla.com'||host.endsWith('.notify.windows.com')))throw Error('Unsupported push service.');return {endpoint:u.href,keys:{auth:s.keys.auth,p256dh:s.keys.p256dh}};}
class RemotePush {
 constructor({directory,subject}){this.file=path.join(directory,'remote-push.json');this.subject=subject;this.entries={};try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));this.keys=saved.keys;this.entries=saved.entries||{};}catch{}if(!this.keys){this.keys=webPush.generateVAPIDKeys();this.save();}}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify({keys:this.keys,entries:this.entries}),{mode:0o600});fs.renameSync(temp,this.file);}
 publicKey(){return {publicKey:this.keys.publicKey};}
 async subscribe(deviceId,s){this.entries[deviceId]=validateSubscription(s);this.save();}
 async unsubscribe(deviceId){delete this.entries[deviceId];this.save();}
 async notify({title='Luce',body='A session needs your attention.'}={}){const payload=JSON.stringify({title,body,url:'/'});await Promise.allSettled(Object.entries(this.entries).map(async([id,s])=>{try{await webPush.sendNotification(s,payload,{TTL:120,vapidDetails:{subject:this.subject,publicKey:this.keys.publicKey,privateKey:this.keys.privateKey},timeout:10000});}catch(error){if([404,410].includes(error.statusCode)){delete this.entries[id];this.save();}}}));}
}
module.exports={RemotePush,validateSubscription};
