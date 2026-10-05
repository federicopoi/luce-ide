import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,chmod,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=await mkdtemp(path.join(os.tmpdir(),'luce-sidebar-smoke-'));
const home=path.join(root,'history'),project=path.join(root,'Project'),fixture=path.join(root,'codex');
await mkdir(project,{recursive:true});
await mkdir(path.join(home,'.codex/sessions'),{recursive:true});
const fixtureSource=(await readFile('tests/fixtures/codex-account.cjs','utf8')).replace('const fs=require','let rateLimitReads=0;const fs=require').replace("case 'account/rateLimits/read':result=","case 'account/rateLimits/read':if(++rateLimitReads>1){send({id:r.id,error:{message:'fixture quota refresh failed'}});return;}result=");
await writeFile(fixture,fixtureSource);
await chmod(fixture,0o755);
let app;
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out waiting for isolated sidebar fixture');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_HISTORY_HOME:home,LUCE_CODEX_EXECUTABLE:fixture},timeout:30000};
 if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);
 const page=await app.firstWindow();
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
 await page.getByText('Open a project',{exact:true}).waitFor();
 const p=await page.evaluate(dir=>window.luce.addProject(dir),project);
 const divider=page.getByRole('separator',{name:'Resize projects sidebar',exact:true});
 const before=(await page.locator('#project-sidebar').boundingBox()).width;
 await divider.focus();await page.keyboard.press('ArrowRight');
 const afterKey=(await page.locator('#project-sidebar').boundingBox()).width;
 assert.ok(afterKey>before,'ArrowRight grows the unified navigation column');
 await page.reload();
 assert.equal((await page.locator('#project-sidebar').boundingBox()).width,afterKey,'Navigation width survives reload');
 await page.getByRole('button',{name:'Toggle project list'}).click();
 await page.getByRole('button',{name:'Toggle recent conversations'}).click();
 assert.equal(await page.locator('#projects').isVisible(),false);
 assert.equal(await page.locator('#recent-content').isVisible(),false);
 await page.getByRole('button',{name:'Toggle project list'}).click();
 await page.getByRole('button',{name:'Toggle recent conversations'}).click();
 assert.equal(await page.locator('#projects').isVisible(),true);
 assert.equal(await page.locator('#recent-content').isVisible(),true);

 const preferredHeight=(await page.locator('#projects-section').boundingBox()).height;
 await page.getByRole('button',{name:'Collapse projects sidebar'}).click();

 const brand=page.locator('.brand'),restore=page.getByRole('button',{name:'Show projects sidebar'});
 assert.ok((await restore.boundingBox()).x>(await brand.boundingBox()).x+(await brand.boundingBox()).width,'Collapsed rail restore control sits beside brand');
 assert.ok((await restore.boundingBox()).x+(await restore.boundingBox()).width<(await page.locator('.titlebar-spacer').boundingBox()).x,'Restore control precedes titlebar spacer');
 await page.reload();
 await page.getByRole('button',{name:'Show projects sidebar'}).waitFor();
 const restoreAfterReload=page.getByRole('button',{name:'Show projects sidebar'});
 assert.ok((await restoreAfterReload.boundingBox()).x+(await restoreAfterReload.boundingBox()).width<(await page.locator('.titlebar-spacer').boundingBox()).x,'Restore placement survives reload while navigation is hidden');
 await restoreAfterReload.click();

 assert.equal(await page.locator('#project-sidebar').isVisible(),true);
 assert.equal(await page.locator('#conversation-sidebar').isVisible(),true);
 assert.ok(Math.abs((await page.locator('#projects-section').boundingBox()).height-preferredHeight)<2,'Hidden rail reload preserves its natural section size');
 const railBox=await page.locator('#project-sidebar').boundingBox(),addBox=await page.locator('#add-project').boundingBox();
 assert.ok(Math.abs((railBox.y+railBox.height)-(addBox.y+addBox.height))<=12,'Add project footer remains at the bottom of its rail');
 assert.equal(await page.locator('[data-project-id="'+p.id+'"]').evaluate(el=>getComputedStyle(el).cursor),'pointer','Project rows use a normal hover cursor');

 const session=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'codex'}),p.id);
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('FIXTURE_READY'),session.id));
 const pane=page.locator('.terminal-pane[data-session-id="'+session.id+'"]');
 await pane.locator('.pane-usage').click();
 const dialog=page.locator('#modal');
 await dialog.waitFor({state:'visible'});
 assert.equal(await dialog.locator('.compact-quota').count(),2,'Usage modal shows both provider quota windows');
 assert.match(await dialog.textContent(),/30% left/);
 assert.match(await dialog.textContent(),/Resets/);
 assert.match(await dialog.textContent(),/Updated/);
 assert.match(await dialog.textContent(),/shared across its conversations/);
 assert.equal(await dialog.locator('progress').count(),2);
 await dialog.getByRole('button',{name:'Refresh usage'}).click();
 await until(()=>dialog.locator('.usage-stale').count().then(count=>count===1));
 assert.equal(await dialog.locator('.compact-quota').count(),2,'Refresh preserves both live quota windows');
 assert.match(await dialog.textContent(),/stale/i,'A failed refresh keeps the cached quota marked stale');
 await mkdir('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/sidebar-usage-dialog.png'});
 await page.getByRole('button',{name:'Close dialog'}).click();
 assert.deepEqual(await page.evaluate(async()=>{const usage=(await window.luce.getState()).accounts[0].usage;return {usage:usage.windows.map(w=>w.usedPercent),stale:usage.stale,p:(await window.luce.getState()).projects[0].id};}),{usage:[70,55],stale:true,p:p.id});
 console.log('PASS: unified navigation width, keyboard sizing, section collapse, restore placement, project cursor, and live provider quota/reset/staleness UI');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
