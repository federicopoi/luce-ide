const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {TerminalManager}=require('../src/main/terminals.cjs');
function setup(t,executables={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-pty-'));
 const manager=new TerminalManager({env:{...process.env},executables,shell:'/bin/zsh'});
 t.after(async()=>{await manager.dispose();fs.rmSync(directory,{recursive:true,force:true});});
 return {manager,project:{id:'project-a',directory}};
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out waiting for terminal output');}
test('real terminal executes input in the selected project and detects preview URL',async t=>{
 const {manager,project}=setup(t),session=manager.create(project,{provider:'shell'});assert.equal(session.projectId,'project-a');
 manager.resize(session.id,110,25);manager.write(session.id,"printf 'ORBIT_PTY_%s\\n' OK; pwd -P; printf 'http://localhost:5173/\\n'\r");
 await until(()=>manager.get(session.id).buffer.includes('ORBIT_PTY_OK')&&manager.get(session.id).buffer.includes(fs.realpathSync(project.directory))&&manager.get(session.id).previewURL);
 assert.ok(manager.get(session.id).buffer.includes(fs.realpathSync(project.directory)));assert.equal(manager.get(session.id).previewURL,'http://localhost:5173/');
 assert.throws(()=>manager.resize(session.id,0,1),/size/i);await manager.close(session.id);assert.equal(manager.get(session.id).status,'exited');assert.throws(()=>manager.write(session.id,'bad'),/closed|exited/i);
});
test('closing a terminal kills signal-resistant owned children before reporting exit',async t=>{
 const {manager,project}=setup(t);const script=path.join(project.directory,'resistant.cjs');
 fs.writeFileSync(script,`const {spawn}=require('node:child_process');process.on('SIGHUP',()=>{});process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',"process.on('SIGHUP',()=>{});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});console.log('RESISTANT_PIDS:'+process.pid+':'+child.pid);setInterval(()=>{},1000);`);
 const session=manager.create(project,{provider:'shell'});manager.write(session.id,`exec node ${script}\r`);
 await until(()=>/RESISTANT_PIDS:\d+:\d+/.test(manager.get(session.id).buffer));
 const pids=manager.get(session.id).buffer.match(/RESISTANT_PIDS:(\d+):(\d+)/).slice(1).map(Number);
 t.after(()=>{for(const pid of pids)try{process.kill(pid,'SIGKILL');}catch{}});
 await manager.close(session.id);for(const pid of pids)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
 assert.equal(manager.get(session.id).status,'exited');
});
test('new Claude conversations have an identity and reuse the live terminal on resume',t=>{
 const {manager,project}=setup(t,{claude:'/bin/cat'});const created=manager.create(project,{provider:'claude'});assert.match(created.conversationId||'',/^[a-f0-9-]{36}$/);
 const resumed=manager.create(project,{provider:'claude',conversationId:created.conversationId});assert.equal(resumed.id,created.id);
});
test('resuming an Orbit-owned live conversation reuses its process',t=>{
 const {manager,project}=setup(t,{claude:'/bin/cat'});const options={provider:'claude',conversationId:'12345678-1234-1234-1234-123456789012'};
 const one=manager.create(project,options),two=manager.create(project,options);assert.equal(one.id,two.id);assert.equal(manager.list().length,1);
 assert.throws(()=>manager.create(project,{provider:'codex'}),/installed|found/i);
 assert.throws(()=>manager.create({...project,directory:'/orbit-folder-does-not-exist'},{provider:'shell'}),/folder|directory/i);
});

test('new Codex starts normally and saved Codex resumes by ID',async t=>{
 const {manager,project}=setup(t);const executable=path.join(project.directory,'codex fixture');
 fs.writeFileSync(executable,`#!/usr/bin/env node\nconsole.log('ARGS:'+JSON.stringify(process.argv.slice(2)));setInterval(()=>{},1000);`,{mode:0o755});manager.executables.codex=executable;
 const fresh=manager.create(project,{provider:'codex'});await until(()=>manager.get(fresh.id).buffer.includes('ARGS:[]'));
 assert.equal(fresh.conversationId,null);assert.equal(fresh.status,'running');
 const saved=manager.create(project,{provider:'codex',conversationId:'12345678-1234-1234-1234-123456789012'});
 await until(()=>manager.get(saved.id).buffer.includes('ARGS:["resume","12345678-1234-1234-1234-123456789012"]'));
});
