import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Regression: navigating to the same URL must not reuse fresh HTTP-cache assets.
const root=await mkdtemp(path.join(os.tmpdir(),'luce-preview-refresh-'));
const folder=path.join(root,'project');await mkdir(folder);
let revision=1,unavailable=false,app;
const requests=[];
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://fixture').pathname;
 requests.push({path:pathname,revision,cache:req.headers['cache-control']});
 if(pathname==='/retry'&&unavailable){req.socket.destroy();return;}
 res.setHeader('Cache-Control','public, max-age=31536000');
 if(pathname==='/app.css'){res.setHeader('Content-Type','text/css');res.end(`body { --revision: ${revision}; }`);return;}
 if(pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(`document.body.dataset.scriptRevision='${revision}';`);return;}
 if(pathname==='/sw.js'){
  res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');
  res.end(`self.addEventListener('install',event=>event.waitUntil(caches.open('fixture').then(cache=>cache.addAll(['/controlled','/app.css','/app.js'])).then(()=>self.skipWaiting())));
   self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
   self.addEventListener('fetch',event=>event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request))));`);return;
 }
 res.setHeader('Content-Type','text/html');
 res.end(`<!doctype html><link rel="stylesheet" href="/app.css"><body data-html-revision="${revision}"><h1>Revision ${revision}</h1><a href="/nested?keep=yes#section">Navigate within preview</a><script src="/app.js"></script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
async function until(check,label){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error(`Timed out: ${label}`);}
async function previewState(){return app.evaluate(async({BrowserWindow})=>{
 const view=BrowserWindow.getAllWindows().flatMap(window=>window.contentView.children).find(view=>view.webContents?.getURL().startsWith('http://127.0.0.1:'));
 if(!view)return null;const contents=view.webContents;
 return {id:contents.id,url:contents.getURL(),bounds:view.getBounds(),...await contents.executeJavaScript(`({html:document.body.dataset.htmlRevision,script:document.body.dataset.scriptRevision,css:getComputedStyle(document.body).getPropertyValue('--revision').trim(),cookie:document.cookie,storage:localStorage.getItem('session-fixture')})`)};
});}
async function executePreview(source){return app.evaluate(({BrowserWindow},source)=>BrowserWindow.getAllWindows().flatMap(window=>window.contentView.children).find(view=>view.webContents?.getURL().startsWith('http://127.0.0.1:')).webContents.executeJavaScript(source),source);}
async function expectRevision(expected){await until(async()=>{const state=await previewState();return state?.html===String(expected)&&state.script===String(expected)&&state.css===String(expected);},`HTML, CSS and JavaScript revision ${expected}; requests=${JSON.stringify(requests)}`);}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_TEST:'1',LUCE_PROFILE:path.join(root,'profile'),LUCE_HISTORY_HOME:path.join(root,'history')},timeout:30000};
 if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await until(()=>page.evaluate(async()=>!!window.luce&&!(await window.luce.getState()).workspaceRestoring),'workspace ready');
 const project=await page.evaluate(folder=>window.luce.addProject(folder),folder);
 await page.evaluate(id=>window.luce.updateProject(id,{layout:2}),project.id);
 const terminal=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell',title:'Refresh source terminal'}),project.id);
 await page.locator(`[data-session-id="${terminal.id}"] .pane-menu`).click();
 await page.getByRole('button',{name:'Preview website',exact:true}).click();
 await page.locator('#preview-url').fill(origin+'/start');await page.locator('#preview-url').press('Enter');
 await expectRevision(1);
 await executePreview(`document.cookie='preview-login=kept; path=/';localStorage.setItem('session-fixture','kept');document.querySelector('a').click()`);
 await until(()=>page.locator('#preview-url').inputValue().then(url=>url===origin+'/nested?keep=yes#section'),'navigated URL reflected in toolbar');
 const before=await previewState();
 revision=2;
 await page.locator('#reload-preview').click();
 await expectRevision(2);
 const after=await previewState();
 assert.equal(after.url,origin+'/nested?keep=yes#section','Refresh keeps the current navigated URL');
 assert.equal(after.id,before.id,'Refresh retains the same embedded browser');
 assert.deepEqual(after.bounds,before.bounds,'Refresh retains the preview layout');
 assert.match(after.cookie,/preview-login=kept/);assert.equal(after.storage,'kept');
 assert.equal(await page.locator(`#preview-terminal-slot [data-session-id="${terminal.id}"]`).count(),1,'Source terminal remains beside preview');
 assert.equal((await page.evaluate(()=>window.luce.getState())).projects.find(p=>p.id===project.id).layout,2);
 assert.ok(requests.some(row=>row.path==='/app.css'&&row.revision===2),'CSS refetched');
 assert.ok(requests.some(row=>row.path==='/app.js'&&row.revision===2),'JavaScript refetched');
 console.log('PASS: hard refresh fetches changed HTML/CSS/JS at the same URL and preserves URL, embedded view, bounds, source terminal, cookies and local storage.');

 // A failed navigation must still be retryable after the server recovers.
 unavailable=true;await page.locator('#preview-url').fill(origin+'/retry');await page.locator('#preview-url').press('Enter');
 await page.locator('#preview-message').waitFor({state:'visible'});
 unavailable=false;revision=3;await page.locator('#reload-preview').click();
 await expectRevision(3);
 await until(()=>page.locator('#preview-message').isHidden(),'error cleared after retry');
 console.log('PASS: Refresh recovers a previously failed navigation.');

 // Characterize hard refresh with a cache-first service worker without deleting it.
 await page.locator('#preview-url').fill(origin+'/controlled');await page.locator('#preview-url').press('Enter');await expectRevision(3);
 await executePreview(`navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready)`);
 await until(()=>executePreview('!!navigator.serviceWorker.controller'),'service worker controls page');
 revision=4;await page.locator('#reload-preview').click();await expectRevision(4);
 assert.equal(await executePreview('navigator.serviceWorker.getRegistrations().then(rows=>rows.length)'),1,'Refresh preserves the service worker registration');
 assert.match((await previewState()).cookie,/preview-login=kept/);
 // Exercise the phone host with real offscreen Electron contents in the same
 // project partition. Its cache-first worker would keep ordinary reload stale.
 await app.evaluate(async({BrowserWindow,app},{projectId,url})=>{
  const {RemotePreview}=process.mainModule.require(app.getAppPath()+'/src/main/remote-preview.cjs');
  globalThis.refreshPhone=new RemotePreview({BrowserWindow,terminals:{get:()=>({id:'fixture-phone',projectId,previewAvailable:true,previewURL:url})}});
  globalThis.refreshPhoneContents=await globalThis.refreshPhone.contents('fixture-phone',{mode:'phone'});
 },{projectId:project.id,url:origin+'/controlled'});
 const readPhone=()=>app.evaluate(()=>globalThis.refreshPhoneContents.executeJavaScript(`({html:document.body.dataset.htmlRevision,script:document.body.dataset.scriptRevision,css:getComputedStyle(document.body).getPropertyValue('--revision').trim(),cookie:document.cookie,url:location.href})`));
 await until(async()=>(await readPhone()).html==='3','phone initially receives cached worker revision');
 revision=5;
 await app.evaluate(()=>globalThis.refreshPhone.input({id:'fixture-phone',mode:'phone',type:'navigate',action:'reload'}));
 await until(async()=>{const state=await readPhone();return state.html==='5'&&state.script==='5'&&state.css==='5';},'phone refresh gets newest HTML/CSS/JS despite cache-first service worker');
 const phone=await readPhone();assert.equal(phone.url,origin+'/controlled');assert.match(phone.cookie,/preview-login=kept/);
 assert.equal((await previewState()).html,'4','Phone refresh leaves the attached desktop view alone');
 await app.evaluate(()=>{globalThis.refreshPhone.close();});
 console.log('PASS: phone hard refresh fetches new page/assets without refreshing desktop or clearing login.');
 assert.deepEqual(errors,[]);
 console.log('PASS: hard refresh bypasses stale cache-first service-worker responses while preserving its registration.');
}finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
