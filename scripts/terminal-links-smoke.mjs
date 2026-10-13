import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root=await mkdtemp(path.join(os.tmpdir(),'luce-terminal-links-'));
const projectDir=path.join(root,'project');await (await import('node:fs/promises')).mkdir(projectDir);
const requests=[];const server=http.createServer((req,res)=>{requests.push(req.url);res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Terminal link preview</title><h1>INTEGRATED_LINK_PREVIEW</h1><a id=popup target=_blank href=/popup>Open preview</a><button id=script onclick="window.open(\'/script-popup\')">Script preview</button>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,oscURL=`http://127.0.0.1:${port}/osc8?marker=one`,wrappedURL=`http://127.0.0.1:${port}/wrapped/${'longpath'.repeat(15)}`;
let app;
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for terminal link behavior');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_HISTORY_HOME:path.join(root,'history')},timeout:30000};
 if(process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();const p=await page.evaluate(dir=>window.luce.addProject(dir),projectDir);await page.evaluate(id=>window.luce.selectProject(id),p.id);await page.evaluate(id=>window.luce.updateProject(id,{layout:1}),p.id);
 const session=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),p.id);await page.locator(`#terminal-workspace [data-session-id="${session.id}"] .xterm`).waitFor();
 await app.evaluate(({shell,ipcMain})=>{globalThis.__terminalLinkMouseWrites=[];const handler=ipcMain._invokeHandlers.get('luce:write-terminal');ipcMain.removeHandler('luce:write-terminal');ipcMain.handle('luce:write-terminal',(event,id,data)=>{if(/^\x1b\[(?:<|M)/.test(data)){globalThis.__terminalLinkMouseWrites.push(data);return;}return handler(event,id,data);});globalThis.__terminalLinkExternalCalls=0;shell.openExternal=()=>{globalThis.__terminalLinkExternalCalls++;return Promise.resolve();};});
 const command=`printf '\\033[?1000h\\033[?1006h'; printf '\\033]8;;${oscURL}\\033\\\\OSC8_LINK\\033]8;;\\033\\\\\\n'; printf '%s\\n' '${wrappedURL}'`;
 await page.evaluate(({id,command})=>window.luce.writeTerminal(id,command+'\r'),{id:session.id,command});
 await until(()=>page.evaluate(async id=>{const buffer=(await window.luce.getTerminal(id)).buffer;return buffer.split('OSC8_LINK').length>2&&buffer.split('/wrapped/').length>2;},session.id));
 await clickTerminalRow(page,/^OSC8_LINK$/);await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));
 assert.equal(await app.evaluate(()=>globalThis.__terminalLinkMouseWrites.length),0,'OSC8 preview clicks must not also reach the CLI mouse handler');await assertPreview(page,oscURL);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL().includes('/osc8')).webContents.executeJavaScript('document.getElementById("popup").click()'));await until(()=>page.locator('#preview-url').inputValue().then(url=>url.endsWith('/popup')));await assertPreview(page,`http://127.0.0.1:${port}/popup`);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL().endsWith('/popup')).webContents.executeJavaScript('document.getElementById("script").click()'));await until(()=>page.locator('#preview-url').inputValue().then(url=>url.endsWith('/script-popup')));await assertPreview(page,`http://127.0.0.1:${port}/script-popup`);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);await page.getByRole('button',{name:'Back to terminal'}).click();await page.waitForFunction(()=>!document.body.classList.contains('preview-mode'));
 await clickTerminalRow(page,/^http:\/\/127\.0\.0\.1:\d+\/wrapped\//);await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));
 assert.equal(await app.evaluate(()=>globalThis.__terminalLinkMouseWrites.length),0,'Wrapped preview clicks must not also reach the CLI mouse handler');await assertPreview(page,wrappedURL);assert.deepEqual([...new Set(requests.filter(url=>url.startsWith('/osc8')||url.startsWith('/wrapped')).map(url=>url.split('?')[0]))],['/osc8',new URL(wrappedURL).pathname],'Both destinations load; local server health checks may repeat requests');
 assert.equal(await app.evaluate(()=>globalThis.__terminalLinkExternalCalls),0,'Terminal links never open the external browser');
 assert.equal((await page.evaluate(id=>window.luce.getTerminal(id),session.id)).status,'running','Link preview keeps the source PTY alive');
 await page.getByRole('button',{name:'Back to terminal'}).click();await page.waitForFunction(()=>!document.body.classList.contains('preview-mode'));
 assert.ok((await page.evaluate(id=>window.luce.getTerminal(id),session.id)).buffer.includes('OSC8_LINK'),'Link clicks keep terminal output');
 const screen=await page.locator(`[data-session-id="${session.id}"] .xterm-screen`).boundingBox();await page.mouse.click(screen.x+screen.width-12,screen.y+screen.height-12);await until(()=>app.evaluate(()=>globalThis.__terminalLinkMouseWrites.length>=2));assert.ok(await app.evaluate(()=>globalThis.__terminalLinkMouseWrites.length>=2),'Ordinary terminal clicks still reach mouse-aware CLIs');
 const other=await page.evaluate(dir=>window.luce.addProject(dir),root);await page.evaluate(id=>window.luce.selectProject(id),other.id);const commandURL=`http://127.0.0.1:${port}/agent-open`;await page.evaluate(({id,url})=>window.luce.writeTerminal(id,`open -a Safari '${url}'\r`),{id:session.id,url:commandURL});await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));await assertPreview(page,commandURL);assert.equal((await page.evaluate(()=>window.luce.getState())).selectedProjectId,p.id,'Browser commands reveal their source project');assert.equal(await page.locator('#preview-terminal-slot [data-session-id="'+session.id+'"]').count(),1,'Browser command preview retains its source conversation');assert.equal(await app.evaluate(()=>globalThis.__terminalLinkExternalCalls),0);await page.getByRole('button',{name:'Back to terminal'}).click();
 await page.screenshot({path:'artifacts/navigation-sidebar.png'});await page.locator('#collapse-projects').click({button:'right'});await page.locator('#popup').getByRole('button',{name:/Use project (tabs|sidebar)/}).click();await page.waitForTimeout(350);assert.equal((await page.locator('.titlebar').boundingBox()).y,0,'Tabs never scroll the application chrome');await page.screenshot({path:'artifacts/navigation-tabs.png'});
 console.log('PASS: terminal links, preview popups, and terminal open commands stay in Luce with their source conversation');
}catch(error){if(app){await (await app.firstWindow()).screenshot({path:'artifacts/link-failure.png'});console.log(await (await app.firstWindow()).evaluate(async()=>({mode:document.body.className,rows:[...document.querySelectorAll('.xterm-rows>div')].map(el=>el.textContent),state:(await window.luce.getState()).terminals.map(s=>({id:s.id,cols:s.cols,rows:s.rows}))})));}throw error;}finally{if(app)await app.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}

async function assertPreview(page,url){
 assert.equal(await page.locator('#preview-url').inputValue(),url,'Preview uses the clicked terminal URL');
 await until(async()=>app.evaluate(({BrowserWindow},target)=>BrowserWindow.getAllWindows()[0].contentView.children.some(view=>view.webContents?.getURL()===target&&view.getVisible()),url));
 await until(()=>page.locator('#browser-surface').isVisible());
}

async function clickTerminalRow(page,text){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const row=page.locator('.xterm-rows > div').filter({hasText:text}).last();let bounds=await row.boundingBox();assert.ok(bounds,'Terminal link text is visible');
 await page.mouse.move(0,0);await page.mouse.move(bounds.x+10,bounds.y+bounds.height/2);await page.waitForTimeout(100);
 bounds=await row.boundingBox();await page.mouse.click(bounds.x+10,bounds.y+bounds.height/2);
}
