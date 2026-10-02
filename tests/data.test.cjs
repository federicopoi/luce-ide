const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('../src/main/store.cjs');
const {discover}=require('../src/main/history.cjs');
const {previewURL,detectLocalURL,launchSpec}=require('../src/main/validation.cjs');
const {execFileSync}=require('node:child_process');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-data-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('project changes survive reload, duplicate paths collapse, removal leaves files',t=>{
 const root=fixture(t),file=path.join(root,'state.json'),folder=path.join(root,'project with spaces');fs.mkdirSync(folder);
 const store=new Store(file),project=store.addProject(folder);
 assert.equal(project.directory,fs.realpathSync(folder));assert.equal(store.addProject(folder).id,project.id);
 store.updateProject(project.id,{name:'My studio',layout:2,previewURL:'http://localhost:5173'});store.setSelected(project.id);
 const reloaded=new Store(file);assert.equal(reloaded.snapshot().projects[0].name,'My studio');assert.equal(reloaded.snapshot().selectedProjectId,project.id);
 reloaded.removeProject(project.id);assert.equal(reloaded.snapshot().projects.length,0);assert.ok(fs.existsSync(folder));
 assert.throws(()=>store.addProject(path.join(root,'missing')),/directory|folder/i);
 assert.throws(()=>store.updateProject(project.id,{layout:3}),/layout|project/i);
});
test('corrupt state is preserved and replaced by a usable empty workspace',t=>{
 const root=fixture(t),file=path.join(root,'state.json');fs.writeFileSync(file,'bad json');const store=new Store(file);
 assert.equal(store.snapshot().projects.length,0);assert.ok(fs.readdirSync(root).some(n=>n.startsWith('state.json.corrupt')));
});
test('history matches recorded directories and prefers explicit names over prompt fallback',async t=>{
 const home=fixture(t),cwd=path.join(home,'project');fs.mkdirSync(cwd);
 const codex=path.join(home,'.codex','sessions','2026');const claude=path.join(home,'.claude','projects','encoded');fs.mkdirSync(codex,{recursive:true});fs.mkdirSync(claude,{recursive:true});
 const id='12345678-1234-1234-1234-123456789012';
 fs.writeFileSync(path.join(codex,'rollout.jsonl'),['null',JSON.stringify({type:'session_meta',payload:{id,cwd,timestamp:'2026-10-01T10:00:00Z'}}),'broken',JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[null,{type:'input_text',text:'Fix the pricing page'}]}})].join('\n'));
 fs.writeFileSync(path.join(home,'.codex','session_index.jsonl'),JSON.stringify({id,thread_name:'Pricing page',updated_at:'2026-10-01T11:00:00Z'}));
 fs.writeFileSync(path.join(claude,'second.jsonl'),['null',JSON.stringify({type:'user',cwd,sessionId:'87654321-1234-1234-1234-123456789012',timestamp:'2026-10-01T09:00:00Z',message:{role:'user',content:[null,{type:'text',text:'Repair mobile navigation'}]}}),JSON.stringify({type:'custom-title',customTitle:'Mobile navigation',sessionId:'87654321-1234-1234-1234-123456789012'})].join('\n'));
 fs.writeFileSync(path.join(claude,'bad.jsonl'),'not json');
 const result=await discover({home});assert.equal(result.sessions.length,2);assert.equal(result.sessions[0].title,'Pricing page');assert.equal(result.sessions[1].title,'Mobile navigation');assert.equal(result.sessions[1].directory,fs.realpathSync(cwd));assert.equal(result.projects.length,1);
});
test('preview schemes are restricted and local URLs survive terminal color sequences',()=>{
 assert.equal(previewURL('localhost:5173'),'http://localhost:5173/');
 assert.equal(previewURL('https://example.com/a'),'https://example.com/a');
 for(const input of ['file:///etc/passwd','javascript:alert(1)','data:text/html,test','http://user:pass@localhost:3000'])assert.throws(()=>previewURL(input),/URL|HTTP|credential/i);
 assert.equal(detectLocalURL('\x1b[32mLocal: http://localhost:5173/\x1b[0m'),'http://localhost:5173/');
 assert.equal(detectLocalURL('http://0.0.0.0:3000'),'http://localhost:3000/');assert.equal(detectLocalURL('https://example.com'),null);
 assert.equal(detectLocalURL("printf 'http://localhost:5173/\\n'"),'http://localhost:5173/');
});
test('resume argument arrays reject hostile IDs and preserve executable paths with spaces',()=>{
 assert.deepEqual(launchSpec('codex','12345678-1234-1234-1234-123456789012',{codex:'/Applications/CLI Tools/codex'}),{file:'/Applications/CLI Tools/codex',args:['resume','12345678-1234-1234-1234-123456789012']});
 assert.deepEqual(launchSpec('claude','12345678-1234-1234-1234-123456789012',{claude:'/bin/claude'}).args,['--resume','12345678-1234-1234-1234-123456789012']);
 assert.throws(()=>launchSpec('codex','x; rm -rf /',{codex:'/bin/codex'}),/session/i);assert.throws(()=>launchSpec('claude',null,{}),/installed|found/i);
});
test('database-only Codex conversations are discovered without transcript files',async t=>{
 const home=fixture(t),root=path.join(home,'.codex');fs.mkdirSync(root);const cwd=fs.realpathSync(home);
 execFileSync('/usr/bin/sqlite3',[path.join(root,'state_5.sqlite'),`CREATE TABLE threads(id TEXT,cwd TEXT,title TEXT,name TEXT,first_user_message TEXT,updated_at INTEGER,source TEXT,has_user_event INTEGER,archived INTEGER);INSERT INTO threads VALUES('database-session-123','${cwd}','Old title','Database conversation','First prompt',1790852400,'cli',1,0);`]);
 const result=await discover({home});assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].title,'Database conversation');assert.equal(result.sessions[0].directory,cwd);
});
