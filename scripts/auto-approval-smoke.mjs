import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-auto-approval-'));
const project=path.join(root,'Auto fixture');await mkdir(project);
const codex=path.join(root,'codex'),claude=path.join(root,'claude');
await writeFile(codex,`#!/usr/bin/env node
const args=process.argv.slice(2),send=m=>console.log(JSON.stringify(m));
const request=id=>send({id,method:id===902?'item/fileChange/requestApproval':'item/commandExecution/requestApproval',params:{threadId:'auto-fixture-thread',command:'echo fixture',cwd:process.cwd()}});
if(args.includes('app-server')){
 require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line);
  if([901,902,903].includes(m.id)&&m.result){send({method:'fixture/decision',params:{id:m.id,decision:m.result.decision}});if(m.id===901&&m.result.decision==='accept')request(902);return;}
  if(m.method==='fixture/next'){request(903);return;}
  if(m.id!==undefined)send({id:m.id,result:m.method==='account/read'?{account:null}:{}});
  if(m.method==='initialize'&&m.params?.clientInfo?.name==='auto-fixture')request(901);
 });
}else{
 const WebSocket=require(${JSON.stringify(path.resolve('node_modules/ws'))}),socket=args[args.indexOf('--remote')+1].slice(7),ws=new WebSocket('ws+unix://'+socket+':/');
 ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'auto-fixture',version:'1'}}})));
 ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.method==='fixture/decision')console.log('CODEX_'+m.params.decision.toUpperCase()+'_'+m.params.id);});
 require('node:readline').createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='next')ws.send(JSON.stringify({method:'fixture/next'}));});setInterval(()=>{},1000);
}
`);
await writeFile(claude,`#!/usr/bin/env node
const {spawn}=require('node:child_process'),args=process.argv.slice(2),settings=JSON.parse(args[args.indexOf('--settings')+1]);
const child=spawn(settings.hooks.PermissionRequest.at(-1).hooks[0].command,{shell:true,env:process.env,stdio:['pipe','pipe','inherit']});let text='';child.stdout.on('data',b=>text+=b);
child.stdin.end(JSON.stringify({hook_event_name:'PermissionRequest',session_id:process.env.LUCE_CONVERSATION_ID,tool_name:'Bash',tool_input:{command:'echo fixture'}}));
child.on('exit',()=>{console.log(JSON.parse(text||'{}').hookSpecificOutput?.decision?.behavior==='allow'?'CLAUDE_AUTO_ALLOWED':'CLAUDE_NOT_ALLOWED');setInterval(()=>{},1000);});
`);
await chmod(codex,0o755);await chmod(claude,0o755);
let app;const errors=[];
async function until(check){for(let i=0;i<200;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Auto approval fixture timed out');}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:path.join(root,'profile'),LUCE_TEST:'1',LUCE_CODEX_EXECUTABLE:codex,LUCE_CLAUDE_EXECUTABLE:claude},timeout:30000};
 if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.getByText('Open a project',{exact:true}).waitFor();
 const p=await page.evaluate(dir=>window.luce.addProject(dir),project);
 const first=await page.evaluate(projectId=>window.luce.createTerminal({projectId,provider:'codex'}),p.id),other=await page.evaluate(projectId=>window.luce.createTerminal({projectId,provider:'codex'}),p.id);
 const pending=id=>page.evaluate(async id=>(await window.luce.getState()).approvals.some(a=>a.terminalId===id),id);
 const output=(id,text)=>page.evaluate(async({id,text})=>(await window.luce.getTerminal(id)).buffer.includes(text),{id,text});
 const toggle=id=>page.locator(`.terminal-pane[data-session-id="${id}"]`).getByRole('switch',{name:'Auto approve requests'});
 await until(async()=>await pending(first.id)&&await pending(other.id));assert.equal(await toggle(first.id).getAttribute('aria-checked'),'false');
 await toggle(first.id).click();await until(()=>output(first.id,'CODEX_ACCEPT_902'));assert.equal(await pending(first.id),false);assert.equal(await pending(other.id),true,'Auto leaves a different terminal pending');assert.equal(await toggle(first.id).getAttribute('aria-checked'),'true');
 await page.reload();await toggle(first.id).waitFor();assert.equal(await toggle(first.id).getAttribute('aria-checked'),'true','renderer reload retains live terminal Auto state');
 await toggle(first.id).click();await until(async()=>!(await page.evaluate(id=>window.luce.getTerminal(id),first.id)).autoApprove);
 await page.evaluate(id=>window.luce.writeTerminal(id,'next\r'),first.id);await until(()=>pending(first.id));await new Promise(resolve=>setTimeout(resolve,150));assert.equal(await output(first.id,'CODEX_ACCEPT_903'),false,'Auto off keeps subsequent requests manual');
 const request=await page.evaluate(async id=>(await window.luce.getState()).approvals.find(a=>a.terminalId===id),first.id);await page.evaluate(id=>window.luce.approveRemote(id,'decline'),request.id);await until(()=>output(first.id,'CODEX_DECLINE_903'));
 const hook=await page.evaluate(projectId=>window.luce.createTerminal({projectId,provider:'claude'}),p.id);await until(()=>pending(hook.id));assert.equal(await toggle(hook.id).getAttribute('aria-checked'),'false');await toggle(hook.id).click();await until(()=>output(hook.id,'CLAUDE_AUTO_ALLOWED'));await until(async()=>!await pending(hook.id));
 const shell=await page.evaluate(projectId=>window.luce.createTerminal({projectId,provider:'shell'}),p.id);await assert.rejects(page.evaluate(id=>window.luce.setAutoApprove(id,true),shell.id),/running agent/);
 await page.evaluate(id=>window.luce.closeTerminal(id),first.id);await assert.rejects(page.evaluate(id=>window.luce.setAutoApprove(id,true),first.id),/running agent|not found/);
 assert.deepEqual(errors,[]);await page.screenshot({path:'artifacts/auto-approval.png'});
 console.log('PASS: per-terminal Auto UI, waiting/future Codex approvals with exact acknowledgment, manual isolation/off, renderer reload, Claude permission hook, and shell/closed-terminal rejection; no model inference.');
}finally{await app?.close();await rm(root,{recursive:true,force:true});}
