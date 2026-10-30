import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,rm,readFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-account-defaults-')),profile=path.join(root,'profile'),historyHome=path.join(root,'history'),directory=path.join(root,'project');
await Promise.all([mkdir(profile),mkdir(directory),mkdir(historyHome)]);
const codex=path.join(root,'codex');
await writeFile(codex,`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2),send=m=>console.log(JSON.stringify(m));
if(args.includes('app-server')){
 require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line);
  if(m.id!==undefined&&m.method)send({id:m.id,result:m.method==='account/read'?{account:fs.existsSync(path.join(process.env.CODEX_HOME,'expired'))?null:{type:'chatgpt',email:'fixture@example.test'}}:m.method==='account/rateLimits/read'?{rateLimits:{}}:{}});
  if(m.method==='fixture/start'){
   const id=process.env.LUCE_TERMINAL_ID;
   const folder=path.join(process.env.CODEX_HOME,'sessions');fs.mkdirSync(folder,{recursive:true});
   fs.writeFileSync(path.join(folder,id+'.jsonl'),[JSON.stringify({type:'session_meta',payload:{id,cwd:process.cwd(),source:'cli'}}),JSON.stringify({type:'response_item',payload:{role:'user',content:[{type:'input_text',text:'Finish the pricing section'}]}})].join('\\n')+'\\n');
   send({method:'thread/started',params:{thread:{id,source:'cli'}}});
  }
 });
}else{
 const WebSocket=require(${JSON.stringify(path.resolve('node_modules/ws'))}),socket=args[args.indexOf('--remote')+1].slice(7),ws=new WebSocket('ws+unix://'+socket+':/');
 ws.on('open',()=>{console.log('FIXTURE_READY');const prompt=args.find(a=>a.startsWith('You are continuing'));if(prompt)console.log('RECOVERED_PROMPT:'+prompt);});
 require('node:readline').createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='save')ws.send(JSON.stringify({method:'fixture/start'}));});setInterval(()=>{},1000);
}
`);await chmod(codex,0o755);
let app;const errors=[];
async function until(check){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Fixture timed out');}
try{
 app=await electron.launch({...(process.env.LUCE_EXECUTABLE?{executablePath:process.env.LUCE_EXECUTABLE}:{}),args:process.env.LUCE_EXECUTABLE?[]:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:profile,LUCE_HISTORY_HOME:historyHome,LUCE_TEST:'1',LUCE_CODEX_EXECUTABLE:codex},timeout:30000});
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.getByText('Open a project',{exact:true}).waitFor();
 const p=await page.evaluate(dir=>window.luce.addProject(dir),directory);
 const a=await page.evaluate(()=>window.luce.addAccount('Personal')),b=await page.evaluate(()=>window.luce.addAccount('Client'));
 await page.evaluate(()=>window.luce.refreshAccounts());
 await page.getByRole('button',{name:'Project Codex account',exact:true}).click();
 await page.locator('#popup').getByRole('button',{name:/Codex - Personal/}).click();
 await until(()=>page.evaluate(async id=>(await window.luce.getState()).projects.find(p=>p.id===id).codexAccountId!==undefined,p.id));
 assert.equal((await page.evaluate(()=>window.luce.getState())).projects.find(row=>row.id===p.id).codexAccountId,a.id);
 await page.getByRole('button',{name:'New conversation',exact:true}).first().click();
 await page.locator('#popup').getByRole('button',{name:/Codex conversation/}).click();
 const session=(await page.evaluate(()=>window.luce.getState())).terminals.find(s=>s.provider==='codex');assert.equal(session.accountId,a.id);
 await page.evaluate(({id})=>window.luce.renameTerminal(id,'Pricing refresh'),session);
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('FIXTURE_READY'),session.id));
 await page.evaluate(({id})=>window.luce.writeTerminal(id,'save\r'),session);
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).conversationId===id,session.id));
 await page.evaluate(()=>window.luce.refreshHistory());
 assert.equal((await page.evaluate(()=>window.luce.getState())).history.find(h=>h.id===session.id).conversationTitle,'Pricing refresh');
 await page.evaluate(id=>window.luce.closeTerminal(id),session.id);await page.evaluate(()=>window.luce.refreshHistory());
 assert.ok(await page.getByRole('button',{name:/Resume Codex · Pricing refresh/}).count());
 // A new terminal has no saved identity: switching must still carry its own visible context.
 const unsaved=await page.evaluate(projectId=>window.luce.createTerminal({projectId,provider:'codex'}),p.id);
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('FIXTURE_READY'),unsaved.id));
 const pane=page.locator(`.terminal-pane[data-session-id="${unsaved.id}"]`);await pane.getByRole('button',{name:'Switch Codex account',exact:true}).click();
 await page.locator('#popup').getByRole('button',{name:/Codex - Client/}).click();
 await until(()=>page.evaluate(async id=>(await window.luce.getState()).terminals.some(s=>s.accountId===id&&s.continuation),b.id));
 const replacement=(await page.evaluate(()=>window.luce.getState())).terminals.find(s=>s.accountId===b.id);
 await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('RECOVERED_PROMPT:'),replacement.id));
 assert.equal((await page.evaluate(()=>window.luce.getState())).terminals.some(s=>s.id===unsaved.id),false);
 await page.evaluate(()=>window.luce.removeAccount('default'));
 assert.equal((await page.evaluate(()=>window.luce.getState())).accounts.find(a=>a.id==='default').hidden,true);
 await page.locator(`.terminal-pane[data-session-id="${replacement.id}"]`).getByRole('button',{name:'Switch Codex account',exact:true}).click();
 assert.equal(await page.locator('#popup').getByRole('button',{name:/Codex - Work/}).count(),0);
 // Resume the named history, expire its source login, then switch with saved context.
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/Resume Codex · Pricing refresh/}).click();
 const resumed=(await page.evaluate(()=>window.luce.getState())).terminals.find(s=>s.conversationId===session.id);
 await writeFile(path.join(profile,'codex-accounts',a.id,'expired'),'');await page.evaluate(()=>window.luce.refreshAccounts());
 assert.equal((await page.evaluate(()=>window.luce.getState())).accounts.find(row=>row.id===a.id).status,'signed-out');
 await page.locator(`.terminal-pane[data-session-id="${resumed.id}"]`).getByRole('button',{name:'Switch Codex account',exact:true}).click();
 await page.locator('#popup').getByRole('button',{name:/Codex - Client/}).click();
 await until(()=>page.evaluate(async id=>!(await window.luce.getState()).terminals.some(s=>s.id===id),resumed.id));
 const carried=(await page.evaluate(()=>window.luce.getState())).terminals.find(s=>s.title==='Pricing refresh · continuation');
 assert.ok(carried);await until(()=>page.evaluate(async id=>(await window.luce.getTerminal(id)).buffer.includes('Finish the pricing section'),carried.id));
 await page.screenshot({path:'artifacts/account-defaults.png'});assert.deepEqual(errors,[]);
 const saved=JSON.parse(await readFile(path.join(profile,'accounts.json'),'utf8'));assert.equal(saved.find(a=>a.id==='default').hidden,true);
 console.log('PASS: project default selector, new account inheritance, rename-before-identity survives close/history, automatic saved/unsaved-context switches with expired source login, hidden Work persistence; no model inference.');
}catch(error){if(app){const page=app.windows()[0];console.error(JSON.stringify(await page.evaluate(async()=>{const s=await window.luce.getState();return {terminals:await Promise.all(s.terminals.map(t=>window.luce.getTerminal(t.id))),history:s.history};}),null,2));}throw error;}finally{await app?.close();await rm(root,{recursive:true,force:true});}
