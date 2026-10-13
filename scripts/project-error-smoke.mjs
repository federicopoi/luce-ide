import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-project-errors-')),profile=path.join(root,'profile'),folder=path.join(root,'Recovery project');let app;
try{
 await mkdir(folder);const options={args:[path.resolve('.')],env:{...process.env,LUCE_TEST:'1',LUCE_PROFILE:profile,LUCE_HISTORY_HOME:path.join(root,'history'),CODEX_HOME:path.join(root,'history/.codex'),SHELL:'/bin/bash'}};
 if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();await page.waitForFunction(async()=>!(await window.luce.getState()).workspaceRestoring);
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>{throw Error('reply was never sent');};});
 await page.locator('#welcome-add').click();
 await page.waitForFunction(()=>document.querySelector('#modal').open&&!!document.querySelector('#project-recovery-path'),null,{timeout:3000});
 assert.match(await page.locator('#modal-content').innerText(),/folder path/i);
 await page.locator('#project-recovery-path').fill(path.join(root,'missing'));
 await page.locator('#modal-submit').click();await page.locator('#project-recovery-error').filter({hasText:'does not exist'}).waitFor();
 assert.equal((await page.evaluate(()=>window.luce.getState())).projects.length,0);
 await page.locator('#project-recovery-path').fill(folder);await page.locator('#modal-submit').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal((await page.evaluate(()=>window.luce.getState())).projects[0].directory,await realpath(folder));
 assert.match(await readFile(path.join(profile,'project-errors.log'),'utf8'),/Renderer: reply was never sent/);
 assert.equal(await page.evaluate(async()=>{try{await window.luce.reportProjectError('arbitrary');return false;}catch{return true;}}),true);
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});await page.locator('#add-project').click();await page.waitForTimeout(100);assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);
 await app.evaluate(({dialog})=>{globalThis.pickerCalls=0;dialog.showOpenDialog=()=>{globalThis.pickerCalls++;return new Promise(resolve=>globalThis.finishPicker=resolve);};});
 const result=page.evaluate(()=>Promise.all([window.luce.addProject(),window.luce.addProject()]));await page.waitForTimeout(150);
 assert.equal(await app.evaluate(()=>globalThis.pickerCalls),1,'Concurrent Add Project calls share one native picker');
 await app.evaluate(()=>globalThis.finishPicker({canceled:true,filePaths:[]}));assert.deepEqual(await result,[null,null]);
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[]});});await page.locator('#add-project').click();await page.locator('#project-recovery-path').waitFor();
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=()=>new Promise(resolve=>globalThis.finishPicker=resolve);});await page.locator('#project-recovery-choose').click();assert.equal(await page.locator('#modal-submit').isDisabled(),true);await page.locator('#modal-cancel').click();
 await page.locator('#project-menu').click();await page.locator('#popup').getByRole('button',{name:'Rename project',exact:true}).click();await page.locator('#modal-input').waitFor();assert.equal(await page.locator('#modal-submit').isDisabled(),false,'Cancel releases the recovery submit state');
 await page.locator('#modal-submit').evaluate(button=>button.disabled=true);await app.evaluate(()=>globalThis.finishPicker({canceled:true,filePaths:[]}));await page.waitForTimeout(100);assert.equal(await page.locator('#modal-submit').isDisabled(),true,'Late recovery reply cannot change another dialog');await page.locator('#modal-submit').evaluate(button=>button.disabled=false);await page.locator('#modal-cancel').click();assert.equal((await page.evaluate(()=>window.luce.getState())).projects.length,1);
 console.log('PASS: picker failure recovery, inline path validation, manual folder opening, diagnostics, cancellation, concurrent picker requests and malformed picker results.');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
