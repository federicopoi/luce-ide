import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,chmod,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-cloudflare-smoke-')),fixture=path.join(root,'wrangler'),projectDir=path.join(root,'Project A'),secondDir=path.join(root,'Project B');
await Promise.all([mkdir(projectDir),mkdir(secondDir),mkdir(path.join(root,'history/.codex/sessions'),{recursive:true}),copyFile('tests/fixtures/wrangler.cjs',fixture)]);await chmod(fixture,0o755);
let app;const errors=[];
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_TEST:'1',LUCE_PROFILE:path.join(root,'profile'),LUCE_HISTORY_HOME:path.join(root,'history'),LUCE_WRANGLER_EXECUTABLE:fixture},timeout:30000};if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}app=await electron.launch(options);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(async()=>!(await window.luce.getState()).workspaceRestoring);
 const first=await page.evaluate(dir=>window.luce.addProject(dir),projectDir);const second=await page.evaluate(dir=>window.luce.addProject(dir),secondDir);await page.evaluate(id=>window.luce.selectProject(id),first.id);
 assert.equal(await page.locator('#project-cloudflare').isVisible(),false);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('switch',{name:'Cloudflare integration'}).check();await page.getByRole('button',{name:'Close dialog'}).click();await page.locator('#project-cloudflare').waitFor({state:'visible'});
 await page.locator('#project-cloudflare').click();await page.getByRole('button',{name:'Manage Cloudflare accounts',exact:true}).click();
 for(const name of ['Personal','Work','Client <B>']){
  await page.getByLabel('Add a Cloudflare account',{exact:true}).fill(name);await page.getByRole('button',{name:'Add & sign in',exact:true}).click();
  await page.waitForFunction(async n=>(await window.luce.getState()).cloudflareAccounts.some(a=>a.name===n&&a.status==='choose-account'),name);
  const card=page.locator('.cloudflare-card').filter({hasText:name});await card.getByLabel('Cloudflare account',{exact:true}).selectOption('a'.repeat(32));
  await page.waitForFunction(async n=>(await window.luce.getState()).cloudflareAccounts.some(a=>a.name===n&&a.status==='signed-in'),name);
 }
 assert.equal(await page.locator('.cloudflare-card').count(),3);await page.screenshot({path:'artifacts/cloudflare-accounts.png'});
 const profiles=await page.evaluate(async()=>(await window.luce.getState()).cloudflareAccounts);await page.getByRole('button',{name:'Close dialog'}).click();
 await page.locator('#project-cloudflare').click();await page.locator('#popup button').filter({hasText:'Client <B>'}).click();await page.waitForFunction(async id=>(await window.luce.getState()).projects.find(p=>p.id===id).cloudflareAccountId,first.id);
 await page.evaluate(({id,account})=>window.luce.updateProject(id,{cloudflareAccountId:account}),{id:second.id,account:profiles[1].id});
 await page.evaluate(id=>window.luce.selectProject(id),second.id);await page.waitForFunction(()=>document.getElementById('project-cloudflare').textContent.includes('Work'));
 await page.evaluate(id=>window.luce.selectProject(id),first.id);await page.waitForFunction(()=>document.getElementById('project-cloudflare').textContent.includes('Client <B>'));
 const cf=await page.locator('#project-cloudflare').boundingBox(),gh=await page.locator('#project-github').boundingBox();assert.ok(cf.x+cf.width<=gh.x+1,'Cloudflare is left of GitHub');
 const session=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),first.id);assert.equal(session.cloudflareAccountId,profiles[2].id);
 const rejection=await page.evaluate(async id=>{try{await window.luce.removeCloudflareAccount(id);return '';}catch(e){return e.message;}},profiles[2].id);assert.match(rejection,/Close.*terminals/i);
 await page.screenshot({path:'artifacts/cloudflare-workspace.png'});await page.setViewportSize({width:960,height:640});await page.screenshot({path:'artifacts/cloudflare-narrow.png'});
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('switch',{name:'Cloudflare integration'}).uncheck();await page.getByRole('button',{name:'Close dialog'}).click();await page.locator('#project-cloudflare').waitFor({state:'hidden'});
 const disabled=await page.evaluate(()=>window.luce.getState());assert.equal(disabled.cloudflareAccounts.length,3);assert.equal(disabled.terminals.find(t=>t.id===session.id).cloudflareAccountId,profiles[2].id);assert.equal(JSON.stringify(disabled).includes('SECRET_FIXTURE'),false);
 const defaults=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),first.id);assert.equal(defaults.cloudflareAccountId,'default');
 assert.deepEqual(errors,[]);await writeFile(path.join(root,'result.json'),JSON.stringify({profiles:profiles.length,errors}));console.log('PASS: optional Cloudflare UI, three profiles, membership selection, per-project switching, selector placement, running-session protection, disabled behavior and secret-free state');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
