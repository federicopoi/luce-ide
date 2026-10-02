import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const root=await mkdtemp(path.join(os.tmpdir(),'orbit-smoke-'));
const first=path.join(root,'Studio Website'),second=path.join(root,'Another Project');await mkdir(first);await mkdir(second);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="background:#f7f3ec;color:#232323;font-family:Georgia;padding:60px"><p>STUDIO / WORK / ABOUT</p><h1 style="font-size:72px;max-width:650px">Good ideas deserve great websites.</h1><p>Orbit preview test</p></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
let app;const errors=[];
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for Orbit state');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,ORBIT_PROFILE:path.join(root,'profile'),ORBIT_TEST:'1'},timeout:30000};
 if(process.env.ORBIT_EXECUTABLE){options.executablePath=process.env.ORBIT_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
 await page.getByText('Open a project',{exact:true}).waitFor();
 const p1=await page.evaluate(dir=>window.orbit.addProject(dir),first);const p2=await page.evaluate(dir=>window.orbit.addProject(dir),second);
 await page.evaluate(id=>window.orbit.selectProject(id),p1.id);await page.locator('[data-project-id="'+p1.id+'"]').click();
 const widths={};
 for(const [name,selector,delta] of [['Resize projects sidebar','.project-rail',45],['Resize conversations sidebar','.conversation-sidebar',-45]]){
  const panel=page.locator(selector),before=(await panel.boundingBox()).width;const handle=page.getByRole('separator',{name});assert.equal(await handle.count(),1,'Sidebar has a resize handle');const bounds=await handle.boundingBox();assert.ok(bounds,'Sidebar has a resize handle');
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+80);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+delta,bounds.y+80,{steps:5});await page.mouse.up();
  widths[selector]=(await panel.boundingBox()).width;assert.ok(Math.abs(widths[selector]-before-delta)<2,'Dragging changes the sidebar width');
 }
 const keyboardHandle=page.getByRole('separator',{name:'Resize projects sidebar'});await keyboardHandle.focus();await page.keyboard.press('ArrowRight');widths['.project-rail']+=10;assert.ok(Math.abs((await page.locator('.project-rail').boundingBox()).width-widths['.project-rail'])<2);
 const session=await page.evaluate(id=>window.orbit.createTerminal({projectId:id,provider:'shell'}),p1.id);
 await page.locator('[data-session-id="'+session.id+'"] .xterm').waitFor();
 await page.evaluate(({id})=>window.orbit.writeTerminal(id,"printf 'ORBIT_SMOKE_%s\\n' OK\r"),session);
 await until(()=>page.evaluate(async id=>(await window.orbit.getTerminal(id)).buffer.includes('ORBIT_SMOKE_OK'),session.id));
 const textarea=page.locator('[data-session-id="'+session.id+'"] .xterm-helper-textarea');await textarea.focus();
 await page.evaluate(()=>window.orbit.refreshHistory());assert.ok(await textarea.evaluate(el=>el===document.activeElement),'Terminal focus must survive history refresh');
 await page.keyboard.type("printf 'ORBIT_TYPED_%s\\n' OK");await page.keyboard.press('Enter');
 await until(()=>page.evaluate(async id=>(await window.orbit.getTerminal(id)).buffer.includes('ORBIT_TYPED_OK'),session.id));
 await page.locator('[data-project-id="'+p2.id+'"]').click();await page.locator('[data-project-id="'+p1.id+'"]').click();
 const after=await page.evaluate(id=>window.orbit.getTerminal(id),session.id);assert.equal(after.status,'running');assert.ok(after.buffer.includes('ORBIT_SMOKE_OK'));
 assert.equal((await page.evaluate(()=>window.orbit.getState())).terminals.length,1);
 assert.equal(await page.locator('.titlebar .view-switch').count(),0);
 const previewButton=page.locator('[data-session-id="'+session.id+'"] .pane-preview');
 assert.equal(await previewButton.count(),0,'No preview icon until a local server responds');
 await page.evaluate(({id,url})=>window.orbit.writeTerminal(id,`printf '%s\\n' '${url}'\r`),{id:session.id,url});
 await previewButton.waitFor();await previewButton.click();
 await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));
 await until(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().some(w=>w.getURL().startsWith('http://127.0.0.1:'))));
 await app.evaluate(async({webContents})=>{
  const view=webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1:'));
  if(!view)throw Error('Embedded preview not created');
  if(view.isLoading())await new Promise(resolve=>view.once('did-finish-load',resolve));
  const result=await view.executeJavaScript('({title:document.body.textContent,bridge:typeof window.orbit,node:typeof require})');
  if(!result.title.includes('Orbit preview test')||result.bridge!=='undefined'||result.node!=='undefined')throw Error('Preview isolation or content failed');
 });
 await page.getByRole('button',{name:'Expand preview',exact:true}).click();assert.ok(await page.evaluate(()=>document.body.classList.contains('expanded-preview')));
 await page.getByRole('button',{name:'Restore preview',exact:true}).click();
 await page.waitForFunction(()=>!document.body.classList.contains('expanded-preview'));
 await until(async()=>{const nativeBounds=await app.evaluate(({BrowserWindow})=>{const view=BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL().startsWith('http://127.0.0.1:'));if(!view||!view.getVisible())throw Error('Preview is not attached and visible');return view.getBounds();});const rendererBounds=await page.locator('#browser-surface').boundingBox();return Math.abs(nativeBounds.width-rendererBounds.width)<2&&Math.abs(nativeBounds.x-rendererBounds.x)<2;});
 const previewCapture=await app.evaluate(async({webContents})=>(await webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1:')).capturePage()).toPNG().toString('base64'));
 await writeFile('artifacts/website-preview.png',Buffer.from(previewCapture,'base64'));
 await page.getByRole('button',{name:'Back to terminal',exact:true}).click();
 await page.locator('[data-session-id="'+session.id+'"] .xterm').waitFor();
 assert.equal((await page.evaluate(id=>window.orbit.getTerminal(id),session.id)).status,'running');
 const rejected=await page.evaluate(async()=>{try{await window.orbit.showPreview({url:'file:///etc/passwd',bounds:{x:0,y:0,width:100,height:100}});return false;}catch{return true;}});assert.ok(rejected);
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
 assert.equal((await page.evaluate(()=>window.orbit.getState())).projects.length,2);assert.equal((await page.evaluate(()=>window.orbit.getState())).terminals.length,1);
 await page.getByRole('button',{name:'Change terminal layout'}).click();await page.getByRole('button',{name:'1 terminal',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#terminal-workspace').classList.contains('layout-1'));
 assert.equal((await page.evaluate(()=>window.orbit.getState())).projects.find(p=>p.id===p1.id).layout,1);
 await new Promise(resolve=>server.close(resolve));
 await until(()=>page.evaluate(async id=>!(await window.orbit.getTerminal(id)).previewAvailable,session.id));
 assert.equal(await page.locator('[data-session-id="'+session.id+'"] .pane-preview').count(),0,'Preview icon disappears when server stops');
 if(process.env.ORBIT_PROVIDER_SMOKE){
  for(const provider of ['codex','claude']){
   const created=await page.evaluate(({projectId,provider})=>window.orbit.createTerminal({projectId,provider}),{projectId:p1.id,provider});if(provider==='claude')assert.match(created.conversationId,/^[a-zA-Z0-9_-]{8,128}$/);else assert.equal(created.conversationId,null);
   await until(()=>page.evaluate(async id=>(await window.orbit.getTerminal(id)).buffer.length>100,created.id));
   await new Promise(resolve=>setTimeout(resolve,10000));
   const startup=await page.evaluate(id=>window.orbit.getTerminal(id),created.id);assert.equal(startup.status,'running',startup.buffer);assert.doesNotMatch(startup.buffer,/No saved session found|ERROR:/);
   if(provider==='claude'){const resumed=await page.evaluate(({projectId,provider,conversationId})=>window.orbit.createTerminal({projectId,provider,conversationId}),{projectId:p1.id,provider,conversationId:created.conversationId});assert.equal(resumed.id,created.id);}
   await page.evaluate(({id,title})=>window.orbit.renameTerminal(id,title),{id:created.id,title:`Test ${provider}`});
   const prefs=(await page.evaluate(()=>window.orbit.getState())).projects.find(p=>p.id===p1.id);if(created.conversationId)assert.equal(prefs.conversationNames[`${provider}:${created.conversationId}`],`Test ${provider}`);
  }
  console.log('PASS: installed Codex normal startup, Claude startup/identity/resume, terminal labels');
 }
 assert.deepEqual(errors,[]);console.log('PASS: projects, real PTY, switching/reload, embedded local preview, fullscreen/return, isolation and unsafe URL rejection');
}finally{
 if(app)await app.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});
}
