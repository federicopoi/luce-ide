const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('../src/main/store.cjs');
const {conversationKey,attachConversationIdentity}=require('../src/main/conversation-identity.cjs');

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'luce-organization-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('conversation identity includes provider and Codex account, while non-Codex identity ignores account',()=>{
 const codex={provider:'codex',accountId:'personal',id:'thread-1'};
 assert.equal(conversationKey(codex),'codex:personal:thread-1');
 assert.notEqual(conversationKey(codex),conversationKey({...codex,accountId:'work'}));
 assert.notEqual(conversationKey(codex),conversationKey({...codex,provider:'claude'}));
 assert.equal(conversationKey({provider:'claude',accountId:'personal',id:'thread-1'}),'claude:thread-1');
});

test('conversation name and project assignment persist by identity without changing the source folder',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),source=path.join(root,'madebyfede'),target=path.join(root,'clone-sites');
 fs.mkdirSync(source);fs.mkdirSync(target);const store=new Store(file),original=store.addProject(source),destination=store.addProject(target);
 const identity={provider:'codex',accountId:'personal',id:'saved-thread'};
 store.setConversationTitle(identity,'Polished product page');
 store.assignConversation(identity,destination.id,{directory:source});
 const persisted=new Store(file),metadata=persisted.conversation(identity);
 assert.equal(metadata.title,'Polished product page');assert.equal(metadata.projectId,destination.id);
 assert.equal(metadata.directory,fs.realpathSync(source));
 assert.equal(persisted.snapshot().projects.find(p=>p.id===original.id).directory,fs.realpathSync(source));
});

test('named conversation groups can share the source folder while normal Add Project still deduplicates paths',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),source=path.join(root,'madebyfede');fs.mkdirSync(source);
 const store=new Store(file),ordinary=store.addProject(source),identity={provider:'claude',id:'claude-thread'};
 const group=store.createNamedProjectForConversation(identity,source,'Campaign refresh');
 assert.notEqual(group.id,ordinary.id);assert.equal(group.directory,ordinary.directory);assert.equal(group.name,'Campaign refresh');
 assert.equal(store.addProject(source).id,ordinary.id);
 assert.equal(store.conversation(identity).projectId,group.id);
});

test('named groups contain only assigned conversations and do not swallow the ordinary source project',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),source=path.join(root,'madebyfede');fs.mkdirSync(source);
 const store=new Store(file),first={provider:'codex',accountId:'default',id:'thread-a'},second={provider:'codex',accountId:'default',id:'thread-b'};
 const group=store.createNamedProjectForConversation(first,source,'Clone site');store.assignConversation(first,group.id,{directory:source});
 const ordinary=store.addProject(source);
 assert.equal(ordinary.directory,group.directory);assert.notEqual(ordinary.id,group.id);assert.equal(ordinary.conversationGroup,undefined);
 assert.equal(store.conversation(first).projectId,group.id);assert.equal(store.conversation(second),null);
});

test('conversation metadata keeps providers and accounts separate when names and assignments change',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),one=path.join(root,'one'),two=path.join(root,'two');fs.mkdirSync(one);fs.mkdirSync(two);
 const store=new Store(file),p1=store.addProject(one),p2=store.addProject(two),base={id:'shared-thread'};
 store.setConversationTitle({...base,provider:'codex',accountId:'work'},'Work copy');
 store.assignConversation({...base,provider:'codex',accountId:'work'},p1.id,{directory:one});
 store.setConversationTitle({...base,provider:'codex',accountId:'personal'},'Personal copy');
 store.assignConversation({...base,provider:'codex',accountId:'personal'},p2.id,{directory:two});
 const saved=new Store(file);
 assert.equal(saved.conversation({...base,provider:'codex',accountId:'work'}).title,'Work copy');
 assert.equal(saved.conversation({...base,provider:'codex',accountId:'personal'}).projectId,p2.id);
});

test('legacy project conversation names become canonical metadata when assigned elsewhere',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),one=path.join(root,'one'),two=path.join(root,'two');fs.mkdirSync(one);fs.mkdirSync(two);
 const store=new Store(file),source=store.addProject(one),target=store.addProject(two),identity={provider:'codex',accountId:'default',id:'legacy-thread'};
 store.updateProject(source.id,{conversationNames:{'codex:default:legacy-thread':'Old custom title'}});
 store.assignConversation(identity,target.id,{directory:one});
 assert.equal(store.conversation(identity).title,'Old custom title');
 assert.equal(store.conversationTitle(identity),'Old custom title');
});

test('legacy Codex titles remain scoped to the default account',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),folder=path.join(root,'project');fs.mkdirSync(folder);
 const store=new Store(file),p=store.addProject(folder),id='copied-thread';store.updateProject(p.id,{conversationNames:{'codex:copied-thread':'Default name'}});
 assert.equal(store.conversationTitle({provider:'codex',accountId:'default',id}),'Default name');
 assert.equal(store.conversationTitle({provider:'codex',accountId:'personal',id}),null);
});

test('removing a named group restores its assigned conversation to the original folder with its name intact',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),source=path.join(root,'source');fs.mkdirSync(source);
 const store=new Store(file),identity={provider:'codex',accountId:'default',id:'thread'},group=store.createNamedProjectForConversation(identity,source,'Named group');
 store.setConversationTitle(identity,'Saved name');store.removeProject(group.id);
 const restored=new Store(file);assert.equal(restored.conversation(identity).projectId,null);assert.equal(restored.conversation(identity).directory,fs.realpathSync(source));assert.equal(restored.conversationTitle(identity),'Saved name');
});

test('a conversation renamed before its provider identity arrives saves that name when linked',t=>{
 const root=fixture(t),file=path.join(root,'workspace.json'),directory=path.join(root,'source');fs.mkdirSync(directory);
 const store=new Store(file),group=store.createNamedProjectForConversation({provider:'codex',accountId:'default',id:'placeholder'},directory,'Named');
 const session={provider:'codex',accountId:'personal',projectId:group.id,workingDirectory:directory,pendingProjectId:group.id,pendingSourceDirectory:directory,pendingConversationTitle:'Renamed before save',title:'Renamed before save'};
 attachConversationIdentity(store,session,'late-thread',{conversationGroup:true});
 const identity={provider:'codex',accountId:'personal',id:'late-thread'},reloaded=new Store(file);
 assert.equal(session.conversationId,'late-thread');assert.equal(reloaded.conversationTitle(identity),'Renamed before save');assert.equal(reloaded.conversation(identity).projectId,group.id);
 assert.equal(session.pendingConversationTitle,undefined);assert.equal(session.pendingProjectId,undefined);
});

test('changing the confirmed conversation identity drops an unrelated inherited title',t=>{
 const root=fixture(t),store=new Store(path.join(root,'workspace.json'));store.setConversationTitle({provider:'codex',accountId:'default',id:'other'},'guitar');const session={provider:'codex',accountId:'default',conversationId:'other',title:'guitar'};attachConversationIdentity(store,session,'own');assert.equal(session.title,'Codex conversation');assert.equal(store.conversationTitle({provider:'codex',accountId:'default',id:'own'}),null);
});
