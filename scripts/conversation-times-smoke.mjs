import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,rm,realpath} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'luce-times-'))),folder=path.join(root,'Studio'),profile=path.join(root,'profile'),home=path.join(root,'history');let app;
try{
 for(const dir of [folder,profile,path.join(home,'.claude/projects/studio')])await mkdir(dir,{recursive:true});
 const date=new Date(Date.now()-3600000),file=path.join(home,'.claude/projects/studio/saved.jsonl');
 await writeFile(file,JSON.stringify({type:'user',sessionId:'saved-hour-old',cwd:folder,timestamp:date.toISOString(),message:{role:'user',content:'Saved hour-old conversation'}}));await utimes(file,date,date);
 await writeFile(path.join(profile,'workspace.json'),JSON.stringify({version:2,projects:[{id:'studio',name:'Studio',directory:folder,layout:1}],selectedProjectId:'studio',conversations:{}}));
 await writeFile(path.join(profile,'open-workspace.json'),JSON.stringify({version:1,sessions:[{id:'unavailable',projectId:'studio',provider:'codex',conversationId:'missing-saved-thread',title:'Unavailable conversation'}]}));
 const options={args:[path.resolve('.')],env:{...process.env,SHELL:'/bin/bash',LUCE_TEST:'1',LUCE_PROFILE:profile,LUCE_HISTORY_HOME:home}};if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();await page.waitForFunction(async()=>!(await window.luce.getState()).workspaceRestoring);
 const state=await page.evaluate(()=>window.luce.getState());assert.equal(state.restoreFailures.length,1,'Fixture really fails to restore');
 assert.equal(await page.locator('.restore-notice').count(),0,'No automatic reopen banner');
 assert.equal(await page.locator('#toast').isVisible(),false,'No automatic reopen toast');
 const saved=page.locator('.history-row').filter({hasText:'Saved hour-old conversation'});await saved.waitFor();
 assert.equal(await saved.locator('time').isVisible(),true,'Saved timestamp is visible');assert.match(await saved.locator('time').textContent(),/1\s*h\s*ago/);
 const session=await page.evaluate(()=>window.luce.createTerminal({projectId:'studio',provider:'shell'}));const live=page.locator(`#conversation-lists [data-session-id="${session.id}"]`);await live.waitFor();
 assert.equal(await live.locator('time').isVisible(),true);assert.match(await live.locator('time').textContent(),/Just now/);
 await page.locator('#collapse-projects').click({button:'right'});await page.locator('#popup').getByRole('button',{name:'Use project tabs'}).click();
 assert.equal(await saved.locator('time').isVisible(),true,'Times remain visible in tabs mode');
 await page.screenshot({path:'artifacts/conversation-times.png'});await page.reload();await saved.waitFor();assert.equal(await page.locator('.restore-notice').count(),0);
 console.log('PASS: saved/live conversation times, tabs/reload, real restore failure stays quiet and retained');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
