const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {ApprovalService}=require('../src/main/remote-approvals.cjs');
const {TerminalManager}=require('../src/main/terminals.cjs');
const {claudePermission}=require('../src/main/claude-permission-bridge.cjs');
const {CodexTerminalBridge}=require('../src/main/codex-terminal-bridge.cjs');
function temp(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'luce-approvals-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
const jsonrpc=(method,id,params={})=>({method,id,params});

test('Auto is opt-in per terminal, handles waiting requests, and resets on terminal removal',async t=>{
 const service=new ApprovalService({directory:temp(t)});await service.start();t.after(()=>service.close());
 service.registerTerminal('auto','thread-auto');service.registerTerminal('manual','thread-manual');
 let requestNumber=0;const request=id=>service.registerRequest({terminalId:id,provider:'claude',requestId:++requestNumber,params:{tool_name:'Bash',tool_input:{command:'echo fixture'}}});
 const waiting=request('auto'),other=request('manual');
 assert.equal(service.autoApproveEnabled('auto'),false);
 service.setAutoApprove('auto',true);assert.equal(await waiting.promise,'accept');
 assert.equal(await request('auto').promise,'accept');assert.equal(service.list().some(row=>row.id===other.id),true);
 service.setAutoApprove('auto',false);const cancelled=request('auto');service.setAutoApprove('auto',true);service.setAutoApprove('auto',false);await new Promise(resolve=>setImmediate(resolve));assert.equal(service.list().some(row=>row.id===cancelled.id),true,'turning off before the decision prevents queued auto approval');
 assert.throws(()=>service.setAutoApprove('missing',true));assert.throws(()=>service.setAutoApprove('auto','yes'));
 service.removeTerminal('auto');assert.equal(await cancelled.promise,undefined);service.registerTerminal('auto','new-thread');assert.equal(service.autoApproveEnabled('auto'),false);
 service.removeTerminal('manual');assert.equal(await other.promise,undefined);
});

test('Codex Auto uses exact upstream acknowledgment and leaves other requests manual',async t=>{
 const service=new ApprovalService({directory:temp(t)});await service.start();t.after(()=>service.close());service.registerTerminal('auto','thread');service.setAutoApprove('auto',true);
 const pending=service.registerRequest({terminalId:'auto',provider:'codex',requestId:41,method:'item/commandExecution/requestApproval',params:{threadId:'thread',command:'echo fixture'}});
 assert.equal(await pending.promise,'accept');assert.equal(service.claimNative('auto',41),'phone','Auto shares the broker arbitration path');
 assert.equal(service.acknowledge(pending.id,'another-terminal',41,'accept'),false);assert.equal(service.acknowledge(pending.id,'auto',42,'accept'),false);
 assert.equal(service.acknowledge(pending.id,'auto',41,'accept'),true);await waitFor(()=>!service.list().some(row=>row.id===pending.id));
 const unrelated=service.registerRequest({terminalId:'auto',provider:'codex',requestId:42,method:'item/tool/requestUserInput',params:{}});await new Promise(resolve=>setImmediate(resolve));assert.equal(service.list().some(row=>row.id===unrelated.id),true,'Auto never answers ordinary agent questions');service.clearRequest('auto',42);
 const stopped=service.registerRequest({terminalId:'auto',provider:'codex',requestId:43,method:'item/fileChange/requestApproval',params:{}});service.removeTerminal('auto');assert.equal(await stopped.promise,undefined);
});

test('terminal shutdown clears Auto even when approval registration is already removed',async t=>{
 const directory=temp(t),service=new ApprovalService({directory});await service.start();
 const manager=new TerminalManager({env:process.env,shell:'/bin/zsh',approvalBridge:service});
 try{const session=manager.create({id:'shutdown',directory},{provider:'shell'});service.setAutoApprove(session.id,true);await manager.dispose();assert.equal(service.autoApproveEnabled(session.id),false);assert.equal(manager.get(session.id).status,'exited');}
 finally{manager.approvalBridge=null;await manager.dispose();await service.close();}
});

test('approval decisions bind to one exact pending request and are consumed once',async t=>{
 const service=new ApprovalService({directory:temp(t)});await service.start();t.after(()=>service.close());
 const a=service.registerRequest({terminalId:'term-a',conversationId:'thread-a',provider:'claude',requestId:'rpc-a',method:'item/commandExecution/requestApproval',params:{command:'touch a'}});
 const b=service.registerRequest({terminalId:'term-b',conversationId:'thread-b',provider:'claude',requestId:'rpc-b',method:'item/commandExecution/requestApproval',params:{command:'touch b'}});
 assert.notEqual(a.id,b.id);assert.deepEqual(service.list().map(x=>x.terminalId),['term-a','term-b']);
 assert.equal(await service.resolve(a.id,'accept'),true);assert.equal(await service.resolve(a.id,'decline'),false);
 assert.equal(await a.promise,'accept');assert.equal(await Promise.race([b.promise,new Promise(resolve=>setTimeout(()=>resolve('pending'),10))]),'pending');service.removeTerminal('term-b');assert.equal(await b.promise,undefined);
});

test('removing a terminal expires only its approvals and cannot resolve them as allow',async t=>{
 const service=new ApprovalService({directory:temp(t)});await service.start();t.after(()=>service.close());
 const old=service.registerRequest({terminalId:'gone',conversationId:'c1',provider:'claude',requestId:'hook-1',params:{tool_name:'Bash',tool_input:{command:'echo x'}}});
 const current=service.registerRequest({terminalId:'stay',conversationId:'c2',provider:'claude',requestId:'hook-2',params:{tool_name:'Bash',tool_input:{command:'echo y'}}});
 service.removeTerminal('gone');assert.equal(await old.promise,undefined);assert.equal(service.list().length,1);assert.equal(await service.resolve(old.id,'accept'),false);assert.equal(await service.resolve(current.id,'decline'),true);
});

test('Claude permission hook waits for authenticated decision and times out with no hook decision',async t=>{
 const service=new ApprovalService({directory:temp(t)});await service.start();t.after(()=>service.close());
 const opts=service.launchOptions('term-c',{directory:'/tmp/project'},{provider:'claude',conversationId:'conv-c',env:{},file:'/claude',args:[]});
 const pending=claudePermission({baseURL:service.baseURL,token:opts.env.LUCE_APPROVAL_TOKEN,terminalId:'term-c',conversationId:'conv-c',input:{tool_name:'Bash',tool_input:{command:'pwd'}},timeoutMs:80});
 const card=await waitFor(()=>service.list()[0]);assert.equal(card.terminalId,'term-c');assert.equal(card.conversationId,'conv-c');service.resolve(card.id,'accept');
 assert.deepEqual(await pending,{hookSpecificOutput:{hookEventName:'PermissionRequest',decision:{behavior:'allow'}}});
 const denied=claudePermission({baseURL:service.baseURL,token:opts.env.LUCE_APPROVAL_TOKEN,terminalId:'term-c',conversationId:'conv-c',input:{tool_name:'Bash',tool_input:{command:'rm -rf x'}},timeoutMs:80});const deniedCard=await waitFor(()=>service.list()[0]);service.resolve(deniedCard.id,'decline');assert.deepEqual(await denied,{hookSpecificOutput:{hookEventName:'PermissionRequest',decision:{behavior:'deny'}}});
 const timed=await claudePermission({baseURL:service.baseURL,token:opts.env.LUCE_APPROVAL_TOKEN,terminalId:'term-c',conversationId:'conv-c',input:{tool_name:'Bash',tool_input:{command:'pwd'}},timeoutMs:20});assert.equal(timed,null);
});

function waitFor(fn){return new Promise((resolve,reject)=>{const deadline=Date.now()+1000;const poll=()=>{const value=fn();if(value)return resolve(value);if(Date.now()>deadline)return reject(Error('timed out'));setTimeout(poll,5);};poll();});}

test('Claude launch merges PermissionRequest command into usage settings and binds session token',async t=>{
 const service=new ApprovalService({directory:temp(t)});await service.start();t.after(()=>service.close());
 const bridge=require('../src/main/claude-usage.cjs').bridgeOptions(temp(t),'term-d',{directory:'/tmp/project'},{HOME:'/tmp'});
 const launched=service.launchOptions('term-d',{directory:'/tmp/project'},{provider:'claude',conversationId:'conv-d',env:bridge.env,file:'/claude',args:['--resume','conv-d'],settings:bridge.settings});
 assert.equal(launched.file,'/claude');assert.deepEqual(launched.args,['--resume','conv-d']);assert.equal(launched.settings.statusLine.type,'command');
 const hook=launched.settings.hooks.PermissionRequest[0];assert.equal(hook.matcher,'*');assert.equal(hook.hooks[0].type,'command');assert.match(hook.hooks[0].command,/claude-permission-bridge/);
 assert.ok(launched.env.LUCE_APPROVAL_TOKEN);assert.ok(launched.env.LUCE_TERMINAL_ID);
});

test('Codex bridge forwards JSON-RPC and approval response on the same connection',async t=>{
 const received=[];let decide;const bridge=new CodexTerminalBridge({terminalId:'term-e',conversationId:'thread-e',onRequest:request=>{received.push(request);return new Promise(resolve=>decide=resolve);}});
 const client=bridge.attachFixture();
 client.send(jsonrpc('initialize',1,{}));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(bridge.fixtureServer.received.id,1);bridge.fixtureServer.receive(jsonrpc('item/commandExecution/requestApproval','approve-1',{threadId:'thread-e',command:'touch x'}));
 await waitFor(()=>received[0]);assert.equal(received[0].terminalId,'term-e');assert.equal(received[0].conversationId,'thread-e');
 client.send({id:'approve-1',result:{decision:'decline'}});decide('accept');await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(bridge.fixtureServer.received,{id:'approve-1',result:{decision:'decline'}});assert.equal(client.messages.filter(m=>m.id==='approve-1'&&m.result).length,1);bridge.fixtureServer.receive({method:'serverRequest/resolved',params:{requestId:'approve-1',threadId:'thread-e'}});assert.deepEqual(client.messages.at(-1),{method:'serverRequest/resolved',params:{requestId:'approve-1',threadId:'thread-e'}});
});

test('TerminalManager routes new approvals through broker and leaves existing launches intact',t=>{
 const calls=[];const approvalBridge=(id,project,opts)=>{calls.push({id,project,opts});return {...opts,file:'/wrapper',args:['wrapper',...opts.args],env:{...opts.env,WRAPPED:'yes'}};};
 const directory=temp(t);const manager=new TerminalManager({env:process.env,executables:{claude:'/bin/cat'},approvalBridge,shell:'/bin/cat'});t.after(()=>manager.dispose());
 const project={id:'p',directory};const session=manager.create(project,{provider:'claude',conversationId:'conversation'});
 assert.equal(calls[0].id,session.id);assert.equal(calls[0].opts.provider,'claude');assert.equal(calls[0].opts.conversationId,'conversation');
 assert.equal(calls.length,1);
});

test('Codex broker decisions beat later native replies and permission grants stay request-scoped',async()=>{
 const bridge=new CodexTerminalBridge({terminalId:'term-race',conversationId:'thread-race',onRequest:()=>Promise.resolve('accept')});const client=bridge.attachFixture();
 bridge.fixtureServer.receive(jsonrpc('item/permissions/requestApproval',42,{threadId:'thread-race',permissions:[{type:'network',host:'example.test'}]}));
 await waitFor(()=>bridge.fixtureServer.received?.id===42);assert.deepEqual(bridge.fixtureServer.received.result,{permissions:[{type:'network',host:'example.test'}],scope:'turn'});
 client.send({id:42,result:{decision:'decline'}});assert.deepEqual(bridge.fixtureServer.received.result,{permissions:[{type:'network',host:'example.test'}],scope:'turn'});
});

test('Claude user PermissionRequest hooks remain in merged settings',async t=>{
 const directory=temp(t),claudeDir=path.join(directory,'claude');fs.mkdirSync(claudeDir);fs.writeFileSync(path.join(claudeDir,'settings.json'),JSON.stringify({hooks:{PermissionRequest:[{matcher:'Bash',hooks:[{type:'command',command:'echo existing'}]}]}}));
 const usage=require('../src/main/claude-usage.cjs').bridgeOptions(directory,'term-user',{directory},{CLAUDE_CONFIG_DIR:claudeDir});
 const service=new ApprovalService({directory});await service.start();t.after(()=>service.close());const options=service.launchOptions('term-user',{directory},{provider:'claude',conversationId:'conv-user',env:usage.env,file:'/claude',args:[],settings:usage.settings});
 assert.equal(options.settings.hooks.PermissionRequest.length,2);assert.equal(options.settings.hooks.PermissionRequest[0].hooks[0].command,'echo existing');
});

test('Codex wrapper keeps broker credentials in environment and config private',async t=>{
 const directory=temp(t),service=new ApprovalService({directory});await service.start();t.after(()=>service.close());
 const options=service.launchOptions('term-private',{directory},{provider:'codex',conversationId:null,env:{CODEX_HOME:directory,PROFILE_SECRET:'account'},file:'/path/to/codex',args:['resume','thread_1'],serverArgs:['--no-daemon']});
 assert.equal(options.file,process.execPath);assert.equal(options.args.length,2);assert.equal(options.args[0].endsWith('codex-terminal-bridge.cjs'),true);assert.ok(options.env.LUCE_APPROVAL_TOKEN);assert.equal(options.env.PROFILE_SECRET,'account');
 const config=JSON.parse(fs.readFileSync(options.args[1],'utf8'));assert.equal(config.file,'/path/to/codex');assert.deepEqual(config.args,['resume','thread_1']);assert.deepEqual(config.serverArgs,['--no-daemon']);assert.equal(fs.statSync(options.args[1]).mode&0o777,0o600);assert.equal(JSON.stringify(config).includes(options.env.LUCE_APPROVAL_TOKEN),false);
});

test('installed Codex CLI starts with an isolated profile and remote option without inference',t=>{
 const {spawnSync}=require('node:child_process');const directory=temp(t);const result=spawnSync('codex',['--remote','unix:///tmp/luce-remote-cli-test','--help'],{env:{...process.env,CODEX_HOME:directory},encoding:'utf8',timeout:10000});if(result.error?.code==='ENOENT'){t.skip('Codex CLI is not installed');return;}assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/--remote/);assert.equal(fs.existsSync(path.join(directory,'auth.json')),false);assert.equal(fs.existsSync(path.join(directory,'.auth.json')),false);
});

test('Codex fixture launches remain approvals-capable through the wrapper',t=>{
 let called=0;const directory=temp(t);const manager=new TerminalManager({env:{LUCE_TEST:'1',LUCE_CODEX_EXECUTABLE:'/bin/cat'},executables:{codex:'/bin/cat'},approvalBridge:(id,project,options)=>{called++;assert.equal(options.provider,'codex');return {file:'/bin/cat',args:[],env:{}};}});t.after(()=>manager.dispose());
 const session=manager.create({id:'fixture-project',directory},{provider:'codex'});assert.equal(called,1);assert.equal(session.approvalsCapable,true);
});

test('owned app-server and installed Codex UI start in private CODEX_HOME without inference',async t=>{
 const {spawnSync}=require('node:child_process');const lookup=spawnSync('which',['codex'],{encoding:'utf8'});if(lookup.status!==0){t.skip('Codex CLI is not installed');return;}const directory=temp(t),profile=path.join(directory,'codex-profile');fs.mkdirSync(profile,{mode:0o700});
 const service=new ApprovalService({directory});await service.start();const manager=new TerminalManager({env:{...process.env,CODEX_HOME:profile},executables:{codex:lookup.stdout.trim()},approvalBridge:service});t.after(async()=>{await manager.dispose();await service.close();});
 const session=manager.create({id:'installed-codex',directory},{provider:'codex'});const deadline=Date.now()+10000;while(Date.now()<deadline&&!manager.get(session.id).buffer.includes('Sign in with ChatGPT'))await new Promise(resolve=>setTimeout(resolve,50));
 const current=manager.get(session.id);assert.equal(current.status,'running',current.buffer);assert.match(current.buffer,/Sign in with ChatGPT/);assert.equal(fs.existsSync(path.join(profile,'auth.json')),false);assert.equal(current.approvalsCapable,true);
});

test('installed Codex UI starts with account arguments while no-daemon stays on its owned app-server',async t=>{
 const {spawnSync}=require('node:child_process');const lookup=spawnSync('which',['codex'],{encoding:'utf8'});if(lookup.status!==0){t.skip('Codex CLI is not installed');return;}const directory=temp(t),profile=path.join(directory,'codex-account');fs.mkdirSync(profile,{mode:0o700});
 const service=new ApprovalService({directory});await service.start();const accounts={environment:()=>({...process.env,CODEX_HOME:profile}),args:()=>['-c','cli_auth_credentials_store="file"']};const manager=new TerminalManager({env:{...process.env,CODEX_HOME:profile},accounts,executables:{codex:lookup.stdout.trim()},approvalBridge:service});t.after(async()=>{await manager.dispose();await service.close();});
 const session=manager.create({id:'installed-codex-account',directory},{provider:'codex'});const deadline=Date.now()+10000;while(Date.now()<deadline&&!manager.get(session.id).buffer.includes('Sign in with ChatGPT')&&manager.get(session.id).status==='running')await new Promise(resolve=>setTimeout(resolve,50));
 const current=manager.get(session.id);assert.equal(current.status,'running',current.buffer);assert.match(current.buffer,/Sign in with ChatGPT/);const bridgeConfig=JSON.parse(fs.readFileSync(path.join(directory,'remote-approvals',`${session.id}.json`),'utf8'));assert.deepEqual(bridgeConfig.args,['-c','cli_auth_credentials_store="file"']);assert.equal(bridgeConfig.serverArgs[0],'--no-daemon');assert.equal(fs.existsSync(path.join(profile,'auth.json')),false);assert.equal(current.approvalsCapable,true);
});

test('Codex native and broker decisions share one acknowledged winner',async t=>{
 const service=new ApprovalService({directory:temp(t)});await service.start();t.after(()=>service.close());
 const pending=service.registerRequest({terminalId:'term-linear',conversationId:'thread-linear',provider:'codex',requestId:'rpc-linear',method:'item/commandExecution/requestApproval',params:{command:'echo x'}});
 const remoteDecision=service.resolve(pending.id,'accept');assert.equal(service.claimNative('term-linear','rpc-linear'),'phone');
 assert.equal(service.list().length,1);assert.equal(service.list()[0].resolving,true);
 assert.equal(service.acknowledge(pending.id,'term-linear','rpc-linear','accept'),true);assert.equal(await remoteDecision,true);assert.equal(service.list().length,0);
 const native=service.registerRequest({terminalId:'term-linear',conversationId:'thread-linear',provider:'codex',requestId:'rpc-native',method:'item/commandExecution/requestApproval',params:{command:'echo native'}});
 assert.equal(service.claimNative('term-linear','rpc-native'),'native');assert.equal(await service.resolve(native.id,'decline'),false);
});

test('Codex bridge claims native response before forwarding it upstream',async()=>{
 let finishClaim,claimStarted=false;const bridge=new CodexTerminalBridge({terminalId:'term-claim',onNative:()=>{claimStarted=true;return new Promise(resolve=>finishClaim=resolve);}});const client=bridge.attachFixture();
 bridge.fixtureServer.receive(jsonrpc('item/commandExecution/requestApproval',9,{threadId:'thread-claim',command:'echo x'}));
 await waitFor(()=>client.messages.some(message=>message.id===9&&message.method==='item/commandExecution/requestApproval'));
 client.send({id:9,result:{decision:'decline'}});await waitFor(()=>claimStarted);assert.notDeepEqual(bridge.fixtureServer.received,{id:9,result:{decision:'decline'}});
 finishClaim('native');await waitFor(()=>bridge.fixtureServer.received?.id===9);assert.deepEqual(bridge.fixtureServer.received,{id:9,result:{decision:'decline'}});
});

test('Codex Unix proxy socket is private to the current user',async t=>{
 const {createServer}=require('node:http');const {createPrivateSocketPath,listenPrivateSocket}=require('../src/main/codex-terminal-bridge.cjs');const privateSocket=createPrivateSocketPath(),server=createServer();t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(privateSocket.directory,{recursive:true,force:true});});
 await listenPrivateSocket(server,privateSocket);assert.equal(fs.statSync(privateSocket.directory).mode&0o777,0o700);assert.equal(fs.statSync(privateSocket.socket).mode&0o777,0o600);
});

test('Codex native approval still works if local broker registration fails',async()=>{
 const bridge=new CodexTerminalBridge({terminalId:'term-offline',onRegister:()=>Promise.reject(Error('broker unavailable'))});const client=bridge.attachFixture();bridge.fixtureServer.receive(jsonrpc('item/commandExecution/requestApproval',11,{threadId:'thread-offline'}));await waitFor(()=>client.messages.some(message=>message.id===11&&message.method));client.send({id:11,result:{decision:'accept'}});await waitFor(()=>bridge.fixtureServer.received?.id===11);assert.deepEqual(bridge.fixtureServer.received,{id:11,result:{decision:'accept'}});
});

test('Codex native fallback clears a registered request when broker wait fails',async()=>{
 const order=[];const bridge=new CodexTerminalBridge({terminalId:'term-wait-fails',onRegister:async()=>({approvalId:'registered'}),onRequest:async()=>{throw Error('wait transport failed');},onResolved:async()=>{order.push('clear');}});const client=bridge.attachFixture();bridge.fixtureServer.receive(jsonrpc('item/commandExecution/requestApproval',12,{threadId:'thread-wait-fails'}));await waitFor(()=>client.messages.some(message=>message.id===12&&message.method));assert.deepEqual(order,['clear']);client.send({id:12,result:{decision:'accept'}});await waitFor(()=>bridge.fixtureServer.received?.id===12);assert.deepEqual(bridge.fixtureServer.received,{id:12,result:{decision:'accept'}});assert.equal(bridge.pending.size,0);
});

test('Codex broker HTTP handshake waits for exact upstream acknowledgment',async t=>{
 const directory=temp(t),service=new ApprovalService({directory});await service.start();t.after(()=>service.close());const options=service.launchOptions('term-http',{directory},{provider:'codex',conversationId:'thread-http',env:{},file:'/codex',args:[]});
 const post=async(route,body)=>{const response=await fetch(service.baseURL+route,{method:'POST',headers:{authorization:`Bearer ${options.env.LUCE_APPROVAL_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({terminalId:'term-http',...body})});assert.ok(response.ok);return response.status===204?null:response.json();};
 const registered=await post('/codex/register',{conversationId:'thread-http',requestId:'rpc-http',method:'item/commandExecution/requestApproval',params:{threadId:'thread-http',command:'echo x'}});const card=service.list()[0];assert.equal(registered.approvalId,card.id);assert.deepEqual(card.decisions,['accept','decline']);
 const waiting=post('/codex/wait',{approvalId:registered.approvalId});const resolved=service.resolve(card.id,'accept');const upstream=await waiting;assert.equal(upstream.decision,'accept');assert.equal(await post('/codex/native',{requestId:'rpc-http'}).then(x=>x.owner),'phone');assert.equal(await Promise.race([resolved.then(()=> 'settled'),new Promise(resolve=>setTimeout(()=>resolve('pending'),10))]),'pending');
 assert.equal((await post('/codex/applied',{approvalId:registered.approvalId,requestId:'rpc-http',decision:'accept'})).applied,true);assert.equal(await resolved,true);assert.equal(service.list().length,0);
 const nativeRegistered=await post('/codex/register',{conversationId:'thread-http',requestId:'rpc-native-http',method:'item/commandExecution/requestApproval',params:{threadId:'thread-http',command:'echo native'}});const nativeWait=post('/codex/wait',{approvalId:nativeRegistered.approvalId});assert.equal((await post('/codex/native',{requestId:'rpc-native-http'})).owner,'native');assert.equal(await service.resolve(nativeRegistered.approvalId,'decline'),false);assert.equal((await nativeWait).decision,undefined);
});

test('Auto leaves Claude AskUserQuestion permission manual',async()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'luce-question-'));const service=new ApprovalService({directory});try{service.registerTerminal('question');service.setAutoApprove('question',true);const row=service.registerRequest({terminalId:'question',provider:'claude',requestId:99,method:'PermissionRequest',params:{tool_name:'AskUserQuestion',tool_input:{questions:[]}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(service.list().some(a=>a.id===row.id),true);}finally{await service.close();fs.rmSync(directory,{recursive:true,force:true});}});

test('Codex actual turn lifecycle reports working, waiting and completion',()=>{
 const bridge=new CodexTerminalBridge({terminalId:'activity'}),events=[];bridge.on('activity',event=>events.push(event.type));
 bridge.fixtureServer.receive({method:'turn/started',params:{}});
 bridge.fixtureServer.receive({id:900,method:'item/tool/requestUserInput',params:{}});
 bridge._fromClient({id:900,result:{answers:{}}});
 bridge.fixtureServer.receive({method:'turn/completed',params:{}});
 assert.deepEqual(events,['working','attention','working','complete']);
});

test('Codex late answers cannot restart a completed or resolved question',()=>{
 for(const end of [{method:'turn/completed'},{method:'serverRequest/resolved',params:{requestId:900}}]){const bridge=new CodexTerminalBridge({terminalId:'late'}),events=[];bridge.on('activity',e=>events.push(e.type));bridge.fixtureServer.receive({id:900,method:'item/tool/requestUserInput'});bridge.fixtureServer.receive(end);const count=events.length;bridge._fromClient({id:900,result:{answers:{}}});assert.equal(events.length,count);}
});

test('Codex stays waiting until all simultaneous questions are answered',()=>{
 const bridge=new CodexTerminalBridge({terminalId:'parallel'}),events=[];bridge.on('activity',e=>events.push(e.type));for(const id of [901,902])bridge.fixtureServer.receive({id,method:'item/tool/requestUserInput'});bridge._fromClient({id:901,result:{answers:{}}});assert.equal(events.at(-1),'attention');bridge._fromClient({id:902,result:{answers:{}}});assert.equal(events.at(-1),'working');
});

test('Codex completion invalidates approvals so late decisions do not restart a finished turn',async()=>{
 let decide;const bridge=new CodexTerminalBridge({terminalId:'finished',onRequest:()=>new Promise(resolve=>decide=resolve)}),events=[];bridge.on('activity',e=>events.push(e.type));bridge.fixtureServer.receive({id:950,method:'item/commandExecution/requestApproval',params:{}});await waitFor(()=>!!decide);bridge.fixtureServer.receive({method:'turn/completed'});decide('accept');await new Promise(resolve=>setImmediate(resolve));assert.equal(events.at(-1),'complete');assert.equal(bridge.pending.size,0);bridge.fixtureServer.receive({method:'turn/started'});assert.equal(events.at(-1),'working');
});

test('Codex clears approvals registered after their turn already completed',async()=>{
 let registered;const clears=[];const bridge=new CodexTerminalBridge({terminalId:'late-registration',onRegister:()=>new Promise(resolve=>registered=resolve),onResolved:id=>clears.push(id)});bridge.fixtureServer.receive({id:970,method:'item/commandExecution/requestApproval',params:{}});bridge.fixtureServer.receive({method:'turn/completed'});const before=clears.length;registered({approvalId:'late-card'});await new Promise(resolve=>setImmediate(resolve));assert.equal(clears.length,before+1);assert.equal(bridge.pending.size,0);
});

test('Codex session identity follows start/resume responses, never background thread reads',()=>{
 const bridge=new CodexTerminalBridge({terminalId:'names'}),ids=[];bridge.on('session',id=>ids.push(id));
 bridge._fromClient({id:1,method:'thread/read',params:{threadId:'other'}});bridge.fixtureServer.receive({id:1,result:{thread:{id:'other'}}});
 bridge._fromClient({id:2,method:'thread/start'});bridge.fixtureServer.receive({id:2,result:{thread:{id:'own'}}});
 assert.deepEqual(ids,['own']);assert.equal(bridge.conversationId,'own');
});


test('background Codex diagnostics stay bounded and private',t=>{const {appendDiagnostic}=require('../src/main/codex-terminal-bridge.cjs'),file=path.join(temp(t),'server.log');appendDiagnostic(file,'timeout diagnostic');assert.match(fs.readFileSync(file,'utf8'),/timeout diagnostic/);assert.equal(fs.statSync(file).mode&0o777,0o600);appendDiagnostic(file,Buffer.alloc(2*1024*1024,65));assert.equal(fs.statSync(file).size,1024*1024);});

test('Codex diagnostics retain the latest bounded tail and are removed with the terminal',async t=>{const {appendDiagnostic}=require('../src/main/codex-terminal-bridge.cjs'),directory=temp(t),service=new ApprovalService({directory});await service.start();t.after(()=>service.close());service.launchOptions('log-cleanup',{directory},{provider:'codex',file:'/codex',args:[]});const file=path.join(directory,'remote-approvals/log-cleanup.json.log');appendDiagnostic(file,Buffer.alloc(1024*1024,65));appendDiagnostic(file,'latest');assert.equal(fs.statSync(file).size,1024*1024);assert.ok(fs.readFileSync(file).toString().endsWith('AAAlatest'));service.removeTerminal('log-cleanup');assert.equal(fs.existsSync(file),false);});
