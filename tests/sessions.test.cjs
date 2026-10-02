const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createCodexThread}=require('../src/main/sessions.cjs');
test('Codex bootstrap obtains a persistent ID without starting a model turn',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-protocol-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const executable=path.join(root,'fixture codex');const cwd=fs.realpathSync(root);
 fs.writeFileSync(executable,`#!/usr/bin/env node\nconst readline=require('node:readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')console.log(JSON.stringify({id:m.id,result:{}}));if(m.method==='thread/start')console.log(JSON.stringify(m.params.cwd===${JSON.stringify(cwd)}&&!('approvalPolicy' in m.params)?{id:m.id,result:{thread:{id:'12345678-1234-1234-1234-123456789012'}}}:{id:m.id,error:{message:'Wrong launch configuration'}}));if(m.method==='turn/start')process.exit(2);});`,{mode:0o755});
 const id=await createCodexThread(executable,cwd,process.env);assert.equal(id,'12345678-1234-1234-1234-123456789012');
});
