const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TerminalManager}=require('../src/main/terminals.cjs');

function fixture(){const manager=new TerminalManager({env:{}});for(const [id,projectId,provider,status]of [['one','background','codex','running'],['two','background','claude','running'],['active','current','codex','running'],['shell','background','shell','running'],['stopped','background','codex','stopping']])manager.sessions.set(id,{id,projectId,provider,status});return manager;}

test('completion marks only background live agents and preserves the running terminal count',()=>{
 const manager=fixture();let changes=0;manager.on('changed',()=>changes++);
 manager.markCompletion('one','current');manager.markCompletion('two','current');
 assert.equal(manager.get('one').completionPending,true);assert.equal(manager.get('two').completionPending,true);
 assert.equal(manager.list().filter(s=>s.projectId==='background'&&s.status==='running').length,3);
 manager.markCompletion('active','current');manager.markCompletion('shell','current');manager.markCompletion('stopped','current');manager.markCompletion('missing','current');manager.markCompletion('one','current');
 assert.equal(manager.get('active').completionPending,false);assert.equal(manager.get('shell').completionPending,false);assert.equal(manager.get('stopped').completionPending,false);assert.equal(changes,2);
});

test('visiting a project acknowledges its completed agents without clearing other projects',()=>{
 const manager=fixture();manager.markCompletion('one','elsewhere');manager.markCompletion('active','elsewhere');
 manager.acknowledgeProject('background');assert.equal(manager.get('one').completionPending,false);assert.equal(manager.get('active').completionPending,true);
 manager.acknowledgeProject('current');assert.equal(manager.get('active').completionPending,false);
});

test('a waiting question updates the project light reason and is acknowledged on visit',()=>{const manager=fixture();manager.markCompletion('one','current','attention');assert.equal(manager.get('one').completionReason,'attention');manager.acknowledgeProject('background');assert.equal(manager.get('one').completionPending,false);});

test('working activity is separate from open terminals and clears on waits and completion',()=>{
 const manager=fixture();let changes=0;manager.on('changed',()=>changes++);
 assert.equal(manager.get('one').working,false);
 manager.setActivity('one','working');manager.setActivity('two','working');manager.setActivity('one','working');
 assert.equal(manager.list().filter(s=>s.working).length,2);assert.equal(changes,2);
 manager.setActivity('one','waiting');assert.equal(manager.get('one').working,false);
 manager.setActivity('two','complete');assert.equal(manager.get('two').working,false);
 manager.setActivity('active','working');manager.setActivity('active','attention');assert.equal(manager.get('active').working,false);
 for(const id of ['shell','stopped','missing'])manager.setActivity(id,'working');
 assert.equal(manager.list().filter(s=>s.working).length,0);
 manager.setActivity('one','working');manager.sessions.get('one').status='exited';assert.equal(manager.get('one').working,false);
});

test('interrupting an agent clears work without claiming its terminal has exited',()=>{
 const manager=fixture();manager.sessions.get('one').child={write(){}};manager.setActivity('one','working');manager.write('one','\x03');assert.equal(manager.get('one').working,false);assert.equal(manager.get('one').status,'running');
});
