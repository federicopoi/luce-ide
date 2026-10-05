import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,copyFile,realpath,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=await mkdtemp(path.join(os.tmpdir(),'luce-organization-smoke-'));
const home=path.join(root,'history'),source=path.join(root,'madebyfede'),target=path.join(root,'clone-sites');
const sessions=path.join(home,'.codex','sessions'),ids=['thread-clone-a','thread-clone-b'];
await Promise.all([mkdir(sessions,{recursive:true}),mkdir(source),mkdir(target)]);
const sourceReal=await realpath(source);
for(let index=0;index<ids.length;index++){
 const id=ids[index],timestamp=new Date(Date.now()-index*1000).toISOString();
 await writeFile(path.join(sessions,`${id}.jsonl`),[JSON.stringify({type:'session_meta',payload:{id,cwd:source,timestamp}}),JSON.stringify({type:'response_item',payload:{role:'user',content:'Clone website faithfully'}})].join('\n')+'\n');
}
await writeFile(path.join(home,'.codex','session_index.jsonl'),ids.map((id,index)=>JSON.stringify({id,thread_name:'Clone website faithfully',updated_at:new Date(Date.now()-index*1000).toISOString()})).join('\n'));
const fixture=path.join(root,'codex-fixture');await copyFile(path.resolve('tests/fixtures/codex-account.cjs'),fixture);await chmod(fixture,0o755);
let app;const errors=[];
async function until(check){for(let i=0;i<180;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for Luce organization state');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_HISTORY_HOME:home,LUCE_CODEX_EXECUTABLE:fixture},timeout:30000};
 if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});await page.getByText('Open a project',{exact:true}).waitFor();
 const original=await page.evaluate(directory=>window.luce.addProject(directory),source),destination=await page.evaluate(directory=>window.luce.addProject(directory),target);
 await page.evaluate(()=>window.luce.refreshHistory());await until(()=>page.locator('.recent-row').count().then(count=>count===2));
 assert.deepEqual(await page.locator('.recent-title').allTextContents(),['Clone website faithfully','Clone website faithfully']);
 const resume=page.locator(`.recent-row[data-conversation-id="${ids[1]}"]`);await resume.click();
 await until(()=>page.evaluate(async id=>(await window.luce.getState()).terminals.some(s=>s.conversationId===id),ids[1]));
 let state=await page.evaluate(()=>window.luce.getState());const first=state.terminals.find(s=>s.conversationId===ids[1]);
 assert.equal(first.projectId,original.id);assert.equal(first.workingDirectory,sourceReal);
 await resume.click();state=await page.evaluate(()=>window.luce.getState());assert.equal(state.terminals.filter(s=>s.conversationId===ids[1]).length,1,'Opening the same recent conversation focuses its existing PTY');
 assert.equal(await page.locator('.history-row').count(),1,'Open conversation is hidden from saved conversation history');
 await page.evaluate(({id,title})=>window.luce.renameTerminal(id,title),{id:first.id,title:'Clone site, second pass'});
 await until(()=>page.locator('.recent-row[data-conversation-id="'+ids[1]+'"] .recent-title').textContent().then(text=>text==='Clone site, second pass'));
 assert.equal((await page.locator('[data-session-id="'+first.id+'"] .pane-title').textContent()),'Clone site, second pass');
 const groupName='Campaign landing page',firstRecent=page.locator(`.recent-row[data-conversation-id="${ids[1]}"]`);await firstRecent.click({button:'right'});await page.getByRole('button',{name:'Add to a new project…',exact:true}).click();await page.locator('#modal-input').fill(groupName);await page.getByRole('button',{name:'Save',exact:true}).click();
 state=await page.evaluate(()=>window.luce.getState());const group=state.projects.find(p=>p.name===groupName),movedLive=state.terminals.find(s=>s.id===first.id);assert.ok(group?.conversationGroup);assert.equal(movedLive.projectId,group.id,'Assigning an open conversation moves its project ownership without replacing the PTY');assert.equal(movedLive.workingDirectory,sourceReal);assert.equal(state.history.find(h=>h.id===ids[1]).assignedProjectId,group.id);
 const secondRow=page.locator(`.recent-row[data-conversation-id="${ids[0]}"]`);await secondRow.dragTo(page.locator(`[data-project-id="${destination.id}"]`));
 await until(()=>page.evaluate(async({id,projectId})=>(await window.luce.getState()).history.find(h=>h.id===id)?.assignedProjectId===projectId,{id:ids[0],projectId:destination.id}));
 state=await page.evaluate(()=>window.luce.getState());const moved=state.history.find(h=>h.id===ids[0]);assert.equal(moved.directory,sourceReal);
 await secondRow.click();await until(()=>page.evaluate(async id=>(await window.luce.getState()).terminals.some(s=>s.conversationId===id),ids[0]));
 state=await page.evaluate(()=>window.luce.getState());const assigned=state.terminals.find(s=>s.conversationId===ids[0]);assert.equal(assigned.projectId,destination.id);assert.equal(assigned.workingDirectory,sourceReal);
 await page.evaluate(id=>window.luce.closeTerminal(id),assigned.id);await until(()=>page.evaluate(async id=>(await window.luce.getState()).terminals.every(s=>s.id!==id),assigned.id));
 await page.evaluate(id=>window.luce.selectProject(id),destination.id);await until(()=>page.locator('.history-row').count().then(count=>count===1));assert.equal(await page.locator('.history-row .history-title').textContent(),'Clone website faithfully');
 await page.evaluate(id=>window.luce.closeTerminal(id),first.id);await until(()=>page.evaluate(async id=>(await window.luce.getState()).terminals.every(s=>s.id!==id),first.id));
 await page.evaluate(id=>window.luce.selectProject(id),group.id);await until(()=>page.locator('.history-row').count().then(count=>count===1));assert.equal(await page.locator('.history-row .history-title').textContent(),'Clone site, second pass');
 await page.evaluate(id=>window.luce.selectProject(id),original.id);assert.equal(await page.locator('.history-row').count(),0,'Named group does not display unassigned history from the same source folder');
 await page.reload();await until(()=>page.locator('.recent-row').count().then(count=>count===2));state=await page.evaluate(()=>window.luce.getState());assert.equal(state.history.find(h=>h.id===ids[1]).conversationTitle,'Clone site, second pass');assert.equal(state.history.find(h=>h.id===ids[1]).assignedProjectId,group.id);assert.deepEqual(errors,[]);
 await page.evaluate(id=>window.luce.removeProject(id),original.id);
 await firstRecent.click({button:'right'});await page.getByRole('button',{name:'Add folder to projects',exact:true}).click();
 state=await page.evaluate(()=>window.luce.getState());assert.ok(state.projects.some(p=>!p.conversationGroup&&p.directory===sourceReal),'Add folder creates an ordinary source project even when the conversation is assigned elsewhere');
 assert.equal(state.history.find(h=>h.id===ids[1]).assignedProjectId,group.id,'Adding the original folder preserves the chosen conversation group');
 console.log('PASS: identity-based resume/focus, same-title separation, live/history/recent rename, cross-folder drag assignment with source CWD, close/restore, and named project grouping persistence');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
