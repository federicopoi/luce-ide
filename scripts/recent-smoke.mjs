import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-recents-')),home=path.join(root,'history'),known=path.join(root,'Known project'),external=path.join(root,'External folder');
for(const dir of [known,external,path.join(home,'.codex/sessions'),path.join(home,'.claude/projects/external')])await mkdir(dir,{recursive:true});
await writeFile(path.join(home,'.codex/sessions/old.jsonl'),[JSON.stringify({type:'session_meta',payload:{id:'old-saved-session',cwd:known,timestamp:new Date(Date.now()-86400000).toISOString()}}),JSON.stringify({type:'response_item',payload:{role:'user',content:'Older known conversation'}})].join('\n'));
await writeFile(path.join(home,'.claude/projects/external/new.jsonl'),JSON.stringify({type:'user',sessionId:'new-saved-session',cwd:external,timestamp:new Date(Date.now()-600000).toISOString(),message:{role:'user',content:'Newest external conversation'}}));
let app;
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_HISTORY_HOME:home},timeout:30000};if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();await page.getByText('Open a project',{exact:true}).waitFor();await page.evaluate(dir=>window.luce.addProject(dir),known);
 assert.equal(await page.locator('#project-heading').count(),0,'No redundant project label in the titlebar');assert.equal(await page.getByRole('button',{name:'Toggle recent conversations',exact:true}).count(),1);
 await page.evaluate(()=>window.luce.refreshHistory());await page.locator('.recent-row').first().waitFor();assert.equal(await page.locator('.recent-row').count(),2);assert.match(await page.locator('.recent-row').first().textContent(),/Newest external conversation/);
 await page.getByRole('textbox',{name:'Search all conversations'}).fill('external');assert.equal(await page.locator('.recent-row').count(),1);
 await page.locator('.recent-row').first().click({button:'right'});await page.getByRole('button',{name:'Add folder to projects',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.luce.getState())).projects.length,2);assert.equal((await page.evaluate(()=>window.luce.getState())).terminals.length,0,'Organizing a folder does not launch a conversation');
 const toggle=page.getByRole('button',{name:'Toggle recent conversations',exact:true});await toggle.click();assert.equal(await page.locator('#recent-content').isVisible(),false);await page.reload();assert.equal(await page.locator('#recent-content').isVisible(),false,'Section collapse persists');await toggle.click();
 const projects=page.getByRole('button',{name:'Toggle project list',exact:true});await projects.click();assert.equal(await page.locator('#projects').isVisible(),false);await projects.click();
 await page.screenshot({path:'artifacts/recent-conversations.png'});console.log('PASS: global recents, newest-first order, search, add external folder, independent section collapse and persistence');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
