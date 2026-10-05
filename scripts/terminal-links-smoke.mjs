import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root=await mkdtemp(path.join(os.tmpdir(),'luce-terminal-links-'));
const projectDir=path.join(root,'project');await (await import('node:fs/promises')).mkdir(projectDir);
const requests=[];const server=http.createServer((req,res)=>{requests.push(req.url);res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Terminal link preview</title><h1>INTEGRATED_LINK_PREVIEW</h1>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,oscURL=`http://127.0.0.1:${port}/osc8?marker=one`,wrappedURL=`http://127.0.0.1:${port}/wrapped/${'longpath'.repeat(15)}`;
let app;
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for terminal link behavior');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_HISTORY_HOME:path.join(root,'history')},timeout:30000};
 if(process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();const p=await page.evaluate(dir=>window.luce.addProject(dir),projectDir);await page.evaluate(id=>window.luce.selectProject(id),p.id);await page.evaluate(id=>window.luce.updateProject(id,{layout:1}),p.id);
 const session=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),p.id);await page.locator(`#terminal-workspace [data-session-id="${session.id}"] .xterm`).waitFor();
 await app.evaluate(({shell})=>{globalThis.__terminalLinkExternalCalls=0;const open=shell.openExternal.bind(shell);shell.openExternal=(...args)=>{globalThis.__terminalLinkExternalCalls++;return open(...args);};});
 const command=`printf '\\033]8;;${oscURL}\\033\\\\OSC8_LINK\\033]8;;\\033\\\\\\n'; printf '%s\\n' '${wrappedURL}'`;
 await page.evaluate(({id,command})=>window.luce.writeTerminal(id,command+'\r'),{id:session.id,command});
 await until(()=>page.evaluate(async id=>{const buffer=(await window.luce.getTerminal(id)).buffer;return buffer.split('OSC8_LINK').length>2&&buffer.split('/wrapped/').length>2;},session.id));
 await clickTerminalRow(page,/^OSC8_LINK$/);await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));
 await assertPreview(page,oscURL);await page.getByRole('button',{name:'Back to terminal'}).click();await page.waitForFunction(()=>!document.body.classList.contains('preview-mode'));
 await clickTerminalRow(page,/^http:\/\/127\.0\.0\.1:\d+\/wrapped\//);await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));
 await assertPreview(page,wrappedURL);assert.deepEqual([...new Set(requests.filter(url=>url.startsWith('/osc8')||url.startsWith('/wrapped')).map(url=>url.split('?')[0]))],['/osc8',new URL(wrappedURL).pathname],'Both destinations load; local server health checks may repeat requests');
 assert.equal(await app.evaluate(()=>globalThis.__terminalLinkExternalCalls),0,'Terminal links never open the external browser');
 assert.equal((await page.evaluate(id=>window.luce.getTerminal(id),session.id)).status,'running','Link preview keeps the source PTY alive');
 await page.getByRole('button',{name:'Back to terminal'}).click();await page.waitForFunction(()=>!document.body.classList.contains('preview-mode'));
 assert.ok((await page.evaluate(id=>window.luce.getTerminal(id),session.id)).buffer.includes('OSC8_LINK'),'Link clicks keep terminal output');
 console.log('PASS: OSC 8 and wrapped plain URLs open in Luce preview for the source terminal without launching an external browser');
}finally{if(app)await app.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}

async function assertPreview(page,url){
 assert.equal(await page.locator('#preview-url').inputValue(),url,'Preview uses the clicked terminal URL');
 await until(async()=>app.evaluate(({BrowserWindow},target)=>BrowserWindow.getAllWindows()[0].contentView.children.some(view=>view.webContents?.getURL()===target&&view.getVisible()),url));
 await until(()=>page.locator('#browser-surface').isVisible());
}

async function clickTerminalRow(page,text){
 const row=page.locator('.xterm-rows > div').filter({hasText:text}).last(),bounds=await row.boundingBox();assert.ok(bounds,'Terminal link text is visible');const x=bounds.x+10,y=bounds.y+bounds.height/2;await page.mouse.move(x,y);await page.waitForTimeout(100);await page.mouse.click(x,y);
}
