import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=await mkdtemp(path.join(os.tmpdir(),'luce-orca-design-'));
const screenshots=path.resolve('artifacts/orca-design');
await mkdir(screenshots,{recursive:true});
const folder=path.join(root,'Studio');
await mkdir(folder);
await writeFile(path.join(folder,'design-notes.md'),'# Studio\nOrca design preview.\n');
let app;
try {
 app=await electron.launch({args:[path.resolve('.')],env:{...process.env,SHELL:'/bin/bash',BASH_SILENCE_DEPRECATION_WARNING:'1',LUCE_TEST:'1',LUCE_PROFILE:path.join(root,'profile'),LUCE_HISTORY_HOME:path.join(root,'history')}});
 const page=await app.firstWindow();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.waitForFunction(async()=>window.luce&&!(await window.luce.getState()).workspaceRestoring);
 await page.getByText('Open a project',{exact:true}).waitFor();
 assert.equal(await page.locator('.workspace').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(9, 9, 9)','Orca uses a near-black working canvas');
 await page.screenshot({path:path.join(screenshots,'01-welcome.png')});
 const project=await page.evaluate(dir=>window.luce.addProject(dir),folder);
 await page.screenshot({path:path.join(screenshots,'02-project.png')});
 const sessions=[];
 for(let i=0;i<4;i++)sessions.push(await page.evaluate(({id,i})=>window.luce.createTerminal({projectId:id,provider:'shell',title:['Design system','Component audit','Interaction checks','Local preview'][i]}),{id:project.id,i}));
 await page.evaluate(id=>window.luce.updateProject(id,{layout:4}),project.id);
 await page.locator('.terminal-pane .xterm').nth(3).waitFor();
 for(const [i,s] of sessions.entries())await page.evaluate(({id,command})=>window.luce.writeTerminal(id,command),{id:s.id,command:"printf '%s\\n' 'Studio workspace ready' 'Session "+(i+1)+" · Orca design preview'\r"});
 await page.waitForFunction(async ids=>(await Promise.all(ids.map(id=>window.luce.getTerminal(id)))).every(t=>t.status==='running'&&t.buffer.includes('Studio workspace ready')),sessions.map(s=>s.id));
 await page.screenshot({path:path.join(screenshots,'03-workspace.png')});
 await page.locator('#browse-files').click();
 await page.getByRole('treeitem',{name:'design-notes.md',exact:true}).click();
 await page.locator('#file-preview').waitFor({state:'visible'});
 assert.match(await page.locator('#file-preview-content').innerText(),/Orca design preview/);
 await page.screenshot({path:path.join(screenshots,'04-files.png')});
 await page.getByRole('button',{name:'Back to terminal',exact:true}).filter({visible:true}).click();
 await page.locator('#files-close').click();
 await page.locator('#search-shortcut').click();
 await page.getByRole('dialog',{name:'Search all conversations'}).waitFor();
 await page.screenshot({path:path.join(screenshots,'05-search.png')});
 await page.keyboard.press('Escape');
 for(const [id,name] of [['settings-button','settings'],['accounts-button','accounts'],['remote-button','phone']]) {
  await page.locator('#'+id).click();
  await page.locator('#modal[open]').waitFor();
  await page.screenshot({path:path.join(screenshots,`06-${name}.png`)});
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 }
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,700));
 await page.waitForFunction(()=>innerWidth===960);
 const metrics=await page.evaluate(()=>{
  const rail=document.querySelector('.utility-rail').getBoundingClientRect();
  const controls=[...document.querySelectorAll('.utility-rail button')].filter(el=>el.getClientRects().length).map(el=>({label:el.getAttribute('aria-label'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
  return {overflow:document.documentElement.scrollWidth>innerWidth,rail:rail.width,controls};
 });
 assert.equal(metrics.overflow,false,'Small windows do not scroll horizontally');
 assert.ok(metrics.controls.every(c=>c.width>=28&&c.height>=28),'Navigation controls remain usable');
 await page.screenshot({path:path.join(screenshots,'07-compact.png')});
 await page.locator('#collapse-projects').click();
 assert.equal(await page.locator('#project-sidebar').isVisible(),false);
 await page.locator('#collapse-projects').click();
 await page.reload();
 await page.locator('.terminal-pane .xterm').nth(3).waitFor();
 assert.equal((await page.evaluate(()=>window.luce.getState())).terminals.filter(t=>t.status==='running').length,4,'Reload preserves all live terminals');
 assert.deepEqual(errors,[]);
 console.log('PASS: Orca canvas, four live terminals, files, search, settings, accounts, phone, compact window and reload. Screenshots: '+screenshots);
} finally {
 if(app)await app.close();
 await rm(root,{recursive:true,force:true});
}
