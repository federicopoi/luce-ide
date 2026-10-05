// Local verification only: opens the existing signed-in account and sends no prompt.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(os.tmpdir(),'luce-codex-startup-'));
let app;
try{
 const options={args:[path.resolve('.')],env:{...process.env,LUCE_PROFILE:profile,LUCE_TEST:'1'},timeout:30000};
 if(process.env.LUCE_EXECUTABLE){options.executablePath=process.env.LUCE_EXECUTABLE;options.args=[];}
 app=await electron.launch(options);
 const page=await app.firstWindow();
 await page.getByText('Open a project',{exact:true}).waitFor();
 const project=await page.evaluate(dir=>window.luce.addProject(dir),path.resolve('.'));
 const session=await page.evaluate(projectId=>window.luce.createTerminal({projectId,provider:'codex',accountId:'default'}),project.id);
 let current,ready=false;
 const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  current=await page.evaluate(id=>window.luce.getTerminal(id),session.id);
  assert.equal(current.status,'running',`Codex exited with code ${current.exitCode}; inspect startup output locally.`);
  const text=current.buffer.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g,'');
  assert.doesNotMatch(text,/ERROR:|Luce Codex bridge failed/);
  assert.doesNotMatch(text,/Sign in with ChatGPT/,'The existing default account must be signed in for this local check.');
  if(/Ask Codex|for shortcuts|Do you trust|Would you like to work/.test(text)){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,'Codex did not reach an interactive startup screen.');
 await page.evaluate(id=>window.luce.closeTerminal(id),session.id);
 assert.equal((await page.evaluate(()=>window.luce.getState())).terminals.some(item=>item.id===session.id),false);
 console.log('PASS: real signed-in default Codex reaches an interactive screen; no prompt sent; only owned test terminal closed.');
}finally{
 await app?.close();
 await rm(profile,{recursive:true,force:true});
}
