const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
const {findLocalServers,reachable}=require('../src/main/servers.cjs');
test('detects a responsive server in a project even when started outside Orbit',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'orbit-server-')));
 const child=spawn(process.execPath,['-e',"require('http').createServer((req,res)=>res.end('ok')).listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:root,stdio:['ignore','pipe','ignore']});
 t.after(()=>{child.kill();fs.rmSync(root,{recursive:true,force:true});});
 const port=await new Promise(resolve=>child.stdout.once('data',d=>resolve(Number(String(d).trim()))));
 const servers=await findLocalServers([root]);assert.equal(servers.get(root),`http://localhost:${port}/`);
 assert.equal((await findLocalServers(['/a-different-project'])).size,0);
 assert.equal(await reachable(`http://127.0.0.1:${port}/`),true);
 await new Promise(resolve=>{child.once('close',resolve);child.kill();});
 assert.equal(await reachable(`http://127.0.0.1:${port}/`),false);
 assert.equal(await reachable('https://example.com/'),false);
});
