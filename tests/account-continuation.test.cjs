const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {accountContinuation}=require('../src/main/conversation-transfer.cjs');

test('account switching recovers saved context locally even when authentication is unavailable',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'luce-continuation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'session.jsonl');fs.writeFileSync(file,[
 {type:'session_meta',payload:{id:'saved-thread',cwd:root}},
 {type:'response_item',payload:{role:'user',content:[{type:'input_text',text:'Finish the checkout bug fix'}]}},
 {type:'response_item',payload:{role:'assistant',content:[{type:'output_text',text:'The remaining issue is a duplicate payment request.'}]}}
 ].map(r=>JSON.stringify(r)).join('\n'));
 const result=await accountContinuation({provider:'codex',accountId:'old',conversationId:'saved-thread',title:'Checkout',workingDirectory:root,buffer:'logged out'},[{provider:'codex',accountId:'old',id:'saved-thread',directory:root,transcriptPath:file}],root);
 assert.match(result,/Finish the checkout bug fix/);assert.match(result,/duplicate payment/);assert.match(result,/summari[sz]e/i);
 assert.doesNotMatch(result,/logged out/);
});

test('account switching falls back to terminal context when saved history cannot be read',async()=>{
 const result=await accountContinuation({accountId:'old',conversationId:'missing',title:'Landing page',workingDirectory:'/project',buffer:'\x1b[31mBuild the pricing section next\x1b[0m'},[], '/missing');
 assert.match(result,/Build the pricing section next/);assert.match(result,/Landing page/);assert.doesNotMatch(result,/\x1b/);
});

test('account switching also works before the first conversation is saved',async()=>{
 const result=await accountContinuation({title:'New conversation',buffer:'',workingDirectory:'/project'},[], '/missing');
 assert.match(result,/No prior conversation text/);assert.match(result,/\/project/);
});


test('new launches use visible project defaults while explicit restored accounts retain their identity',async t=>{
 const vm=require('node:vm'),{Accounts}=require('../src/main/accounts.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'luce-account-restore-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const accounts=new Accounts({directory:root}),personal=accounts.add('Personal');accounts.remove('default');
 const live={};const context=vm.createContext({accounts,project:()=>({id:'p',directory:root,codexAccountId:'default'}),removingAccounts:new Set(),accountLoginActive:()=>false,
 accountService:{list:()=>[{id:personal.id,status:'signed-in'}]},history:{sessions:[]},workspaceShutdown:false,cloudflareAccounts:{},
 withCloudflareLaunch:async(service,p,options,action)=>action(options),createPreparedTerminal:(p,options)=>{live[options.accountId]={};return {id:options.accountId,accountId:options.accountId};},
 terminals:{sessions:{get:id=>live[id]}},fs});
 const source=fs.readFileSync(require.resolve('../src/main/main.cjs'),'utf8');
 vm.runInContext(source.slice(source.indexOf('async function createValidatedTerminal('),source.indexOf('const pickProjectFolder=')),context);
 const fresh=await context.createValidatedTerminal({projectId:'p',provider:'codex'});assert.equal(fresh.accountId,personal.id);
 const restored=await context.createValidatedTerminal({projectId:'p',provider:'codex',accountId:'default'});assert.equal(restored.accountId,'default');
});
