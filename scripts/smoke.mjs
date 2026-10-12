import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-smoke-'));
const first=path.join(root,'Studio Website'),second=path.join(root,'Another Project');await mkdir(first);await mkdir(second);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="background:#f7f3ec;color:#232323;font-family:Georgia;padding:60px"><p>STUDIO / WORK / ABOUT</p><h1 style="font-size:72px;max-width:650px">Good ideas deserve great websites.</h1><p>Luce preview test</p></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
let app;const errors=[];
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for Luce state');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_HISTORY_HOME:path.join(root,'history')},timeout:30000};
 if((process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE)){options.executablePath=(process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE);options.args=[];}
 app=await electron.launch(options);assert.equal(await app.evaluate(({app})=>app.getName()),'Luce');const page=await app.firstWindow();await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});page.on('pageerror',error=>errors.push(error.message));
 await page.getByText('Open a project',{exact:true}).waitFor();await until(()=>page.evaluate(async()=>!(await window.luce.getState()).workspaceRestoring));
 const p1=await page.evaluate(dir=>window.luce.addProject(dir),first);const p2=await page.evaluate(dir=>window.luce.addProject(dir),second);
 await page.evaluate(id=>window.luce.selectProject(id),p1.id);await page.locator('[data-project-id="'+p1.id+'"]').click();
 await page.locator('[data-project-id="'+p2.id+'"]').dragTo(page.locator('[data-project-id="'+p1.id+'"]'),{targetPosition:{x:40,y:3}});
 await until(()=>page.evaluate(async id=>(await window.luce.getState()).projects[0].id===id,p2.id));
 assert.equal((await page.evaluate(()=>window.luce.getState())).selectedProjectId,p1.id,'reordering keeps the active project');
 await page.reload();await page.locator('[data-project-id="'+p2.id+'"]').waitFor();
 assert.equal(await page.locator('#projects .project-item').first().getAttribute('data-project-id'),p2.id,'project order survives renderer reload');
 await page.locator('[data-project-id="'+p2.id+'"]').dragTo(page.locator('[data-project-id="'+p1.id+'"]'),{targetPosition:{x:40,y:30}});
 await until(()=>page.evaluate(async id=>(await window.luce.getState()).projects.at(-1).id===id,p2.id));
 const widths={};
 for(const [name,selector,delta] of [['Resize projects sidebar','.project-rail',45]]){
  const panel=page.locator(selector),before=(await panel.boundingBox()).width;const handle=page.getByRole('separator',{name});assert.equal(await handle.count(),1,'Sidebar has a resize handle');const bounds=await handle.boundingBox();assert.ok(bounds,'Sidebar has a resize handle');
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+80);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+delta,bounds.y+80,{steps:5});await page.mouse.up();
  widths[selector]=(await panel.boundingBox()).width;assert.ok(Math.abs(widths[selector]-before-delta)<2,'Dragging changes the sidebar width');
 }
 const keyboardHandle=page.getByRole('separator',{name:'Resize projects sidebar'});await keyboardHandle.focus();await page.keyboard.press('ArrowRight');widths['.project-rail']+=10;assert.ok(Math.abs((await page.locator('.project-rail').boundingBox()).width-widths['.project-rail'])<2);
 const workspaceBefore=(await page.locator('.workspace').boundingBox()).width;
 for(const name of ['Toggle projects sidebar']){const button=page.getByRole('button',{name,exact:true});assert.equal(await button.count(),1,'Each sidebar has a collapse button');await button.click();}
 assert.equal(await page.locator('.project-rail').isVisible(),false);assert.equal(await page.locator('.conversation-sidebar').isVisible(),false);
 assert.ok((await page.locator('.workspace').boundingBox()).width>workspaceBefore+250);
 await page.reload();await page.getByRole('button',{name:'Toggle projects sidebar',exact:true}).waitFor();assert.equal(await page.locator('.conversation-sidebar').isVisible(),false,'Collapsed state survives reload');
 for(const name of ['Toggle projects sidebar'])await page.getByRole('button',{name,exact:true}).click();
 for(const [selector,width] of Object.entries(widths))assert.ok(Math.abs((await page.locator(selector).boundingBox()).width-width)<2,'Restoring preserves sidebar widths');
 const session=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),p1.id);
 await page.locator('[data-session-id="'+session.id+'"] .xterm').waitFor();
 await page.evaluate(({id})=>window.luce.writeTerminal(id,"printf 'ORBIT_SMOKE_%s\\n' OK\r"),session);
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('ORBIT_SMOKE_OK'),session.id));
 await page.locator('[data-project-id="'+p1.id+'"] .project-terminal-count').waitFor();assert.equal(await page.locator('[data-project-id="'+p1.id+'"] .project-terminal-count').textContent(),'1');
 await page.evaluate(id=>window.luce.updateProject(id,{layout:4}),p1.id);
 const pane=page.locator('.terminal-pane[data-session-id="'+session.id+'"]');const header=pane.locator('.pane-header');
 await header.dragTo(page.locator('.terminal-workspace > .terminal-pane').nth(3));
 assert.equal(await page.locator('.terminal-workspace > .terminal-pane').nth(3).getAttribute('data-session-id'),session.id,'Dragging moves a live terminal into an empty pane');
 assert.equal((await page.evaluate(id=>window.luce.getTerminal(id),session.id)).status,'running');
 const another=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),p1.id);
 await page.locator('.terminal-pane[data-session-id="'+another.id+'"] .pane-header').waitFor();assert.equal(await page.locator('[data-project-id="'+p1.id+'"] .project-terminal-count').textContent(),'2');
 await page.locator('.terminal-pane[data-session-id="'+another.id+'"] .pane-header').dragTo(pane);
 assert.equal(await page.locator('.terminal-workspace > .terminal-pane').nth(3).getAttribute('data-session-id'),another.id,'Dragging into an occupied pane swaps terminals');
 await page.evaluate(id=>window.luce.closeTerminal(id),another.id);assert.equal(await page.locator('[data-project-id="'+p1.id+'"] .project-terminal-count').textContent(),'1');
  const textarea=page.locator('[data-session-id="'+session.id+'"] .xterm-helper-textarea');await textarea.focus();
 const discarded=path.join(root,'should-not-exist');await page.keyboard.type(`touch '${discarded}'`);await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.keyboard.type("printf 'CLEARED_INPUT_OK\\n'");await page.keyboard.press('Enter');await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('CLEARED_INPUT_OK\r\n'),session.id));await assert.rejects((await import('node:fs/promises')).access(discarded));
 const dropped=path.join(root,"file with space's.txt");await writeFile(dropped,'File drop test');
 await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='drop-fixture';document.body.append(input);});await page.locator('#drop-fixture').setInputFiles(dropped);
 await page.keyboard.type("printf 'DROPPED_PATH:%s\\n' ");
 await page.evaluate(id=>{const transfer=new DataTransfer();transfer.items.add(document.querySelector('#drop-fixture').files[0]);document.querySelector('.terminal-pane[data-session-id="'+id+'"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));document.querySelector('#drop-fixture').remove();},session.id);
 await page.keyboard.press('Enter');await until(()=>page.evaluate(async({id,file})=>(await window.luce.getTerminal(id)).buffer.includes('DROPPED_PATH:'+file+'\r\n'),{id:session.id,file:dropped}));
 await page.evaluate(()=>window.luce.refreshHistory());assert.ok(await textarea.evaluate(el=>el===document.activeElement),'Terminal focus must survive history refresh');
 await page.keyboard.type("printf 'ORBIT_TYPED_%s\\n' OK");await page.keyboard.press('Enter');
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('ORBIT_TYPED_OK'),session.id));
 await page.locator('[data-project-id="'+p2.id+'"]').click();await page.locator('[data-project-id="'+p1.id+'"]').click();
 const after=await page.evaluate(id=>window.luce.getTerminal(id),session.id);assert.equal(after.status,'running');assert.ok(after.buffer.includes('ORBIT_SMOKE_OK'));
 assert.equal((await page.evaluate(()=>window.luce.getState())).terminals.filter(t=>t.status==='running').length,1);
 assert.equal(await page.locator('.titlebar .view-switch').count(),0);
 const previewButton=page.locator('[data-session-id="'+session.id+'"] .pane-preview');
 assert.equal(await previewButton.count(),0,'No preview icon until a local server responds');
 await page.evaluate(({id,url})=>window.luce.writeTerminal(id,`printf '%s\\n' '${url}'\r`),{id:session.id,url});
 await previewButton.waitFor();await previewButton.click();
 await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));
 await until(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().some(w=>w.getURL().startsWith('http://127.0.0.1:'))));
 await app.evaluate(async({webContents})=>{
  const view=webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1:'));
  if(!view)throw Error('Embedded preview not created');
  if(view.isLoading())await new Promise(resolve=>view.once('did-finish-load',resolve));
  const result=await view.executeJavaScript('({title:document.body.textContent,bridge:typeof window.luce,node:typeof require})');
  if(!result.title.includes('Luce preview test')||result.bridge!=='undefined'||result.node!=='undefined')throw Error('Preview isolation or content failed');
 });
 await page.getByRole('button',{name:'Expand preview',exact:true}).click();assert.ok(await page.evaluate(()=>document.body.classList.contains('expanded-preview')));
 await page.getByRole('button',{name:'Restore preview',exact:true}).click();
 await page.waitForFunction(()=>!document.body.classList.contains('expanded-preview'));
 await until(async()=>{const nativeBounds=await app.evaluate(({BrowserWindow})=>{const view=BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL().startsWith('http://127.0.0.1:'));if(!view||!view.getVisible())throw Error('Preview is not attached and visible');return view.getBounds();});const rendererBounds=await page.locator('#browser-surface').boundingBox();return Math.abs(nativeBounds.width-rendererBounds.width)<2&&Math.abs(nativeBounds.x-rendererBounds.x)<2;});
 const previewCapture=await app.evaluate(async({webContents})=>(await webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1:')).capturePage()).toPNG().toString('base64'));
 await writeFile('artifacts/website-preview.png',Buffer.from(previewCapture,'base64'));
 await page.getByRole('button',{name:'Back to terminal',exact:true}).click();
 await page.locator('[data-session-id="'+session.id+'"] .xterm').waitFor();
 assert.equal((await page.evaluate(id=>window.luce.getTerminal(id),session.id)).status,'running');
 const rejected=await page.evaluate(async()=>{try{await window.luce.showPreview({url:'file:///etc/passwd',bounds:{x:0,y:0,width:100,height:100}});return false;}catch{return true;}});assert.ok(rejected);
 const recovering=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>Recovered preview</h1>');});
 await new Promise(resolve=>recovering.listen(0,'127.0.0.1',resolve));const recoveryPort=recovering.address().port;await new Promise(resolve=>recovering.close(resolve));
 await page.locator('[data-session-id="'+session.id+'"] .pane-preview').click();await page.locator('#preview-url').fill(`http://127.0.0.1:${recoveryPort}`);await page.locator('#preview-url').press('Enter');
 await page.locator('#preview-message').waitFor({state:'visible'});
 await new Promise(resolve=>recovering.listen(recoveryPort,'127.0.0.1',resolve));
 try{await page.getByRole('button',{name:'Reload preview'}).click();await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.some(v=>v.webContents?.getURL().startsWith('http://127.0.0.1:')&&v.getVisible())));}
 finally{await new Promise(resolve=>recovering.close(resolve));}
 await page.getByRole('button',{name:'Back to terminal',exact:true}).click();
 await page.screenshot({path:'artifacts/terminal-workspace.png'});
 await page.reload();for(const [selector,width] of Object.entries(widths))assert.ok(Math.abs((await page.locator(selector).boundingBox()).width-width)<2,'Sidebar width survives reload');await page.locator('[data-session-id="'+session.id+'"] .xterm').waitFor();
 assert.equal((await page.evaluate(()=>window.luce.getState())).projects.length,2);assert.equal((await page.evaluate(()=>window.luce.getState())).terminals.filter(t=>t.status==='running').length,1);
 await page.getByRole('button',{name:'Change terminal layout'}).click();await page.getByRole('button',{name:'1 terminal',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#terminal-workspace').classList.contains('layout-1'));
 assert.equal((await page.evaluate(()=>window.luce.getState())).projects.find(p=>p.id===p1.id).layout,1);
 await new Promise(resolve=>server.close(resolve));
 await until(()=>page.evaluate(async id=>!(await window.luce.getTerminal(id)).previewAvailable,session.id));
 assert.equal(await page.locator('[data-session-id="'+session.id+'"] .pane-preview').count(),0,'Preview icon disappears when server stops');
 if((process.env.LUCE_PROVIDER_SMOKE||process.env.ORBIT_PROVIDER_SMOKE)){
  for(const provider of ['codex','claude']){
   const created=await page.evaluate(({projectId,provider})=>window.luce.createTerminal({projectId,provider}),{projectId:p1.id,provider});if(provider==='claude')assert.match(created.conversationId,/^[a-zA-Z0-9_-]{8,128}$/);else assert.equal(created.conversationId,null);
   await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.length>100,created.id));
   await new Promise(resolve=>setTimeout(resolve,10000));
   const startup=await page.evaluate(id=>window.luce.getTerminal(id),created.id);assert.equal(startup.status,'running',startup.buffer);assert.doesNotMatch(startup.buffer,/No saved session found|ERROR:/);
   if(provider==='claude'){const resumed=await page.evaluate(({projectId,provider,conversationId})=>window.luce.createTerminal({projectId,provider,conversationId}),{projectId:p1.id,provider,conversationId:created.conversationId});assert.equal(resumed.id,created.id);}
   await page.evaluate(({id,title})=>window.luce.renameTerminal(id,title),{id:created.id,title:`Test ${provider}`});
   const prefs=(await page.evaluate(()=>window.luce.getState())).projects.find(p=>p.id===p1.id);if(created.conversationId)assert.equal(prefs.conversationNames[`${provider}:${created.conversationId}`],`Test ${provider}`);
  }
  console.log('PASS: installed Codex normal startup, Claude startup/identity/resume, terminal labels');
 }
 assert.deepEqual(errors,[]);console.log('PASS: projects, real PTY, switching/reload, embedded local preview, fullscreen/return, isolation and unsafe URL rejection');
}finally{
 if(app)await app.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});
}
