import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=await mkdtemp(path.join(os.tmpdir(),'luce-terminal-resize-'));
const projectDir=path.join(root,'project');await mkdir(projectDir);
let app;
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for terminal resize state');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_HISTORY_HOME:path.join(root,'history')},timeout:30000};
 if(process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE||process.env.ORBIT_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();const p=await page.evaluate(dir=>window.luce.addProject(dir),projectDir);await page.evaluate(id=>window.luce.selectProject(id),p.id);
 await page.evaluate(id=>window.luce.updateProject(id,{layout:4}),p.id);
 const first=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),p.id);
 await page.locator(`[data-session-id="${first.id}"] .xterm`).waitFor();
 const second=await page.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),p.id);
 await page.locator(`[data-session-id="${second.id}"] .xterm`).waitFor();
 await page.evaluate(({id})=>window.luce.writeTerminal(id,"printf 'RESIZE_KEEPALIVE\\n'\r"),first);
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('RESIZE_KEEPALIVE'),first.id));
 const pane=page.locator(`#terminal-workspace [data-session-id="${first.id}"]`),terminalNode=await pane.locator('.xterm').elementHandle();await terminalNode.evaluate(node=>{window.__resizeSmokeNode=node;});
 const before=await page.evaluate(id=>window.luce.getTerminal(id),first.id);
 const handle=page.getByRole('separator',{name:'Resize terminal columns'});assert.equal(await handle.count(),1,'Four-pane view exposes a column divider');
 const rect=await handle.boundingBox();assert.ok(rect,'Column divider is visible');
 await page.mouse.move(rect.x+rect.width/2,rect.y+80);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+100,rect.y+80,{steps:6});await page.mouse.up();
 await until(async()=>{const now=await page.evaluate(id=>window.luce.getTerminal(id),first.id);return now.cols!==before.cols;});
 const after=await page.evaluate(id=>window.luce.getTerminal(id),first.id);assert.ok(after.cols>before.cols,'Dragging wider increases the PTY column count');
 await page.evaluate(()=>window.luce.refreshHistory());
 await page.waitForTimeout(100);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await pane.locator('.xterm').evaluate(node=>node===window.__resizeSmokeNode),true,'Resize keeps the same xterm DOM node attached');
 assert.ok(after.buffer.includes('RESIZE_KEEPALIVE'),'Resize keeps terminal output');
 await page.reload();await page.locator(`[data-session-id="${first.id}"] .xterm`).waitFor();
 assert.ok(await page.locator('[role="separator"][aria-label="Resize terminal columns"]').count(),'Divider survives renderer reload');
 const ratio=await page.evaluate(id=>JSON.parse(localStorage.getItem(`luce-terminal-splits:${id}`)),p.id);assert.ok(ratio?.columns>0.5,'Per-project column ratio persists after reload');
 const rowHandle=page.getByRole('separator',{name:'Resize terminal rows'});assert.equal(await rowHandle.count(),1,'Four-pane view exposes a row divider');const beforeRows=await page.evaluate(id=>window.luce.getTerminal(id),first.id);const rowRect=await rowHandle.boundingBox();await page.mouse.move(rowRect.x+100,rowRect.y+rowRect.height/2);await page.mouse.down();await page.mouse.move(rowRect.x+100,rowRect.y+rowRect.height/2+80,{steps:6});await page.mouse.up();await until(async()=>{const now=await page.evaluate(id=>window.luce.getTerminal(id),first.id);return now.rows!==beforeRows.rows;});const afterRows=await page.evaluate(id=>window.luce.getTerminal(id),first.id);assert.ok(afterRows.rows>beforeRows.rows,'Dragging the row divider increases the PTY row count');await rowHandle.focus();await page.keyboard.press('ArrowDown');
 const adjusted=await page.evaluate(id=>JSON.parse(localStorage.getItem(`luce-terminal-splits:${id}`)),p.id);assert.ok(adjusted.rows>0.5,'Keyboard divider adjusts and persists row ratio');
 await page.locator(`#terminal-workspace [data-session-id="${first.id}"] .pane-menu`).click();await page.getByRole('button',{name:'Preview website'}).click();await page.waitForFunction(()=>document.body.classList.contains('preview-mode'));
 assert.deepEqual(await page.evaluate(id=>JSON.parse(localStorage.getItem(`luce-terminal-splits:${id}`)),p.id),adjusted,'Hidden workspace rendering keeps saved split proportions');await page.getByRole('button',{name:'Back to terminal'}).click();await page.waitForFunction(()=>!document.body.classList.contains('preview-mode'));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,640));await page.waitForFunction(()=>innerWidth===960);
 for(const [name,delta] of [['Resize projects sidebar',300],['Resize conversations sidebar',300]]){const sidebarHandle=page.getByRole('separator',{name}),bounds=await sidebarHandle.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+100);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+delta,bounds.y+100,{steps:5});await page.mouse.up();}
 const narrow=await page.locator('#terminal-workspace').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,columns:getComputedStyle(node).gridTemplateColumns}));assert.ok(narrow.width<368,'Fixture reaches a workspace narrower than the normal pane minimums');assert.ok(narrow.scroll<=narrow.width+1,`Grid tracks shrink to fit the narrow workspace: ${JSON.stringify(narrow)}`);
 const narrowHandle=page.getByRole('separator',{name:'Resize terminal columns'});assert.ok(Number(await narrowHandle.getAttribute('aria-valuemin'))<Number(await narrowHandle.getAttribute('aria-valuemax')),'Accessible divider bounds reflect the current pane minimums');
 await rowHandle.dblclick();const reset=await page.evaluate(id=>JSON.parse(localStorage.getItem(`luce-terminal-splits:${id}`)),p.id);assert.equal(reset.rows,0.5,'Double click resets the row split');
 await page.evaluate(id=>window.luce.updateProject(id,{layout:2}),p.id);await page.waitForFunction(()=>document.querySelector('#terminal-workspace').classList.contains('layout-2'));assert.equal(await page.getByRole('separator',{name:'Resize terminal columns'}).count(),1,'Two-pane layout keeps the column divider');assert.equal(await page.getByRole('separator',{name:'Resize terminal rows'}).count(),0,'Two-pane layout has no row divider');
 await page.locator(`#terminal-workspace [data-session-id="${first.id}"] .pane-menu`).click();await page.getByRole('button',{name:'Focus terminal'}).click();await page.waitForFunction(()=>document.querySelector('#terminal-workspace').classList.contains('focused'));assert.equal(await page.locator('#terminal-workspace').getByRole('separator').count(),0,'Focused single pane has no resize dividers');
 await page.locator(`#terminal-workspace [data-session-id="${first.id}"] .pane-menu`).click();await page.getByRole('button',{name:'Focus terminal'}).click();await page.evaluate(id=>window.luce.updateProject(id,{layout:1}),p.id);await page.waitForFunction(()=>document.querySelector('#terminal-workspace').classList.contains('layout-1'));assert.equal(await page.locator('#terminal-workspace').getByRole('separator').count(),0,'One-pane layout has no resize dividers');
 assert.equal((await page.evaluate(id=>window.luce.getTerminal(id),first.id)).status,'running','PTY remains alive');
 console.log('PASS: terminal grid resizing updates real PTYs, preserves xterm state, persists per-project proportions, supports keyboard/reset, and hides handles for one pane');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
