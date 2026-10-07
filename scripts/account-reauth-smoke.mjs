import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,chmod,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-reauth-')),profile=path.join(root,'profile'),home=path.join(root,'history'),folder=path.join(root,'project'),fixture=path.join(root,'codex');
await mkdir(folder);await mkdir(path.join(home,'.codex/sessions'),{recursive:true});
let source=await readFile('tests/fixtures/codex-account.cjs','utf8');
source=source.replace("let result={};switch(r.method)",`if(r.method==='account/login/start'){
 if(fs.existsSync(path.join(home,'hold-login'))){fs.writeFileSync(path.join(home,'login-entered'),'1');const timer=setInterval(()=>{if(fs.existsSync(path.join(home,'release-login'))){clearInterval(timer);fs.unlinkSync(path.join(home,'hold-login'));rl.emit('line',line);}},25);return;}
 fs.appendFileSync(path.join(home,'login-attempts'),'attempt\\n');
 }let result={};switch(r.method)`);
source=source.replace('},250);break;','},1500);break;');
await writeFile(fixture,source);await chmod(fixture,0o755);let app;
async function until(check,label){for(let i=0;i<200;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error(`Timed out: ${label}`);}
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_TEST:'1',LUCE_PROFILE:profile,LUCE_HISTORY_HOME:home,LUCE_CODEX_EXECUTABLE:fixture},timeout:30000};
 if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);const page=await app.firstWindow();
 await until(()=>page.evaluate(async()=>!!window.luce&&!(await window.luce.getState()).workspaceRestoring),'workspace startup');
 await app.evaluate(({dialog,shell})=>{dialog.showMessageBox=async()=>({response:1});shell.openExternal=async()=>{};});
 const project=await page.evaluate(dir=>window.luce.addProject(dir),folder),account=await page.evaluate(()=>window.luce.addAccount('Fixture managed'));
 await page.evaluate(id=>window.luce.loginAccount(id),account.id);
 await until(()=>page.evaluate(async id=>(await window.luce.getState()).accounts.find(a=>a.id===id)?.status==='signed-in',account.id),'first fixture sign-in');
 const managed=path.join(profile,'codex-accounts',account.id);
 const create=()=>page.evaluate(({projectId,accountId})=>window.luce.createTerminal({projectId,accountId,provider:'codex'}),{projectId:project.id,accountId:account.id});
 const terminal=await create();
 await assert.rejects(page.evaluate(id=>window.luce.loginAccount(id),account.id),/Close or switch|in use/i,'Live account credentials cannot be replaced');
 assert.equal((await readFile(path.join(managed,'login-attempts'),'utf8')).trim().split('\n').length,1,'Rejected reauth never reaches the provider');
 await page.evaluate(id=>window.luce.closeTerminal(id),terminal.id);

 const original=await page.evaluate(projectId=>window.luce.createTerminal({projectId,provider:'codex'}),project.id);
 await app.evaluate(({dialog})=>{dialog.showMessageBox=()=>new Promise(resolve=>globalThis.finishAccountSwitch=()=>resolve({response:0}));});
 const switching=page.evaluate(({id,target})=>window.luce.switchAccount(id,target,{fresh:true}),{id:original.id,target:account.id});
 await until(()=>app.evaluate(()=>typeof globalThis.finishAccountSwitch==='function'),'account switch confirmation');
 await assert.rejects(page.evaluate(id=>window.luce.loginAccount(id),account.id),/operation|in use/i,'Account transfer excludes reauth');
 await app.evaluate(({dialog})=>{globalThis.finishAccountSwitch();delete globalThis.finishAccountSwitch;dialog.showMessageBox=async()=>({response:1});});await switching;

 await writeFile(path.join(managed,'hold-login'),'1');
 const signingIn=page.evaluate(id=>window.luce.loginAccount(id),account.id);
 await until(async()=>{try{await readFile(path.join(managed,'login-entered'));return true;}catch{return false;}},'asynchronous provider login call');
 await assert.rejects(page.evaluate(id=>window.luce.loginAccount(id),account.id),/sign.in|operation|in use/i,'Concurrent reauth is rejected');
 await assert.rejects(create(),/sign.in|operation|in use/i,'New terminals cannot race credential replacement');
 await assert.rejects(page.evaluate(({id,target})=>window.luce.switchAccount(id,target,{fresh:true}),{id:original.id,target:account.id}),/sign.in|operation|in use/i);
 await assert.rejects(page.evaluate(id=>window.luce.removeAccount(id),account.id),/operation|in use/i);
 await writeFile(path.join(managed,'release-login'),'1');await signingIn;
 const refreshed=await page.evaluate(()=>window.luce.refreshAccounts());
 for(const row of refreshed){assert.equal(row.loginId,undefined,'Refresh never exports private login identifiers');assert.equal(row.authUrl,undefined,'Refresh never exports private authentication URLs');}
 await assert.rejects(create(),/sign.in|operation|in use/i,'Existing auth reported during pending browser login does not unlock creation');
 let after;await until(async()=>{
  const state=await page.evaluate(()=>window.luce.getState());if(state.accounts.find(a=>a.id===account.id)?.status!=='signed-in')return false;
  try{after=await create();return true;}catch(error){if(/Finish or cancel this account’s sign-in first/.test(error.message))return false;throw error;}
 },'public signed-in account unlocks terminal creation after reauth');
 assert.equal(after.accountId,account.id);
 console.log('PASS: managed Codex reauth rejects live sessions and transfers; pending login excludes concurrent login/create/switch/remove; completion unlocks the account.');
}finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
