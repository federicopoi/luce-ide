const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {TerminalManager}=require('../src/main/terminals.cjs');
function setup(t,executables={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-pty-'));
 const manager=new TerminalManager({env:{...process.env},executables,shell:'/bin/zsh'});
 t.after(()=>{manager.dispose();fs.rmSync(directory,{recursive:true,force:true});});
 return {manager,project:{id:'project-a',directory}};
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out waiting for terminal output');}
test('real terminal executes input in the selected project and detects preview URL',async t=>{
 const {manager,project}=setup(t),session=manager.create(project,{provider:'shell'});assert.equal(session.projectId,'project-a');
 manager.resize(session.id,110,25);manager.write(session.id,"printf 'ORBIT_PTY_%s\\n' OK; pwd -P; printf 'http://localhost:5173/\\n'\r");
 await until(()=>manager.get(session.id).buffer.includes('ORBIT_PTY_OK')&&manager.get(session.id).buffer.includes(fs.realpathSync(project.directory))&&manager.get(session.id).previewURL);
 assert.ok(manager.get(session.id).buffer.includes(fs.realpathSync(project.directory)));assert.equal(manager.get(session.id).previewURL,'http://localhost:5173/');
 assert.throws(()=>manager.resize(session.id,0,1),/size/i);manager.close(session.id);assert.equal(manager.get(session.id).status,'exited');assert.throws(()=>manager.write(session.id,'bad'),/closed|exited/i);
});
test('resuming an Orbit-owned live conversation reuses its process',t=>{
 const {manager,project}=setup(t,{claude:'/bin/cat'});const options={provider:'claude',conversationId:'12345678-1234-1234-1234-123456789012'};
 const one=manager.create(project,options),two=manager.create(project,options);assert.equal(one.id,two.id);assert.equal(manager.list().length,1);
 assert.throws(()=>manager.create(project,{provider:'codex'}),/installed|found/i);
 assert.throws(()=>manager.create({...project,directory:'/orbit-folder-does-not-exist'},{provider:'shell'}),/folder|directory/i);
});
