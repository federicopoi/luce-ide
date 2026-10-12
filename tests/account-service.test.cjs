const {test}=require('node:test');const assert=require('node:assert/strict');const {AccountService}=require('../src/main/account-service.cjs');
test('a disconnected account service preserves quota as stale and reports unavailable',async()=>{const service=new AccountService({get:()=>({id:'default'}),list:()=>[{id:'default'}]},'unused');service.status.set('default',{email:'work@example.test',usage:{windows:[{label:'Weekly',usedPercent:40}]}});service.client=async()=>{throw Error('Disconnected');};await service.refresh('default');assert.equal(service.publicList()[0].status,'unavailable');assert.equal(service.publicList()[0].usage.stale,true);assert.equal(service.publicList()[0].usage.windows[0].usedPercent,40);});
test('signed-out accounts clear old quota rather than display the previous account usage',async()=>{const accounts={get:()=>({id:'default'}),list:()=>[{id:'default'}]};const service=new AccountService(accounts,'unused');service.status.set('default',{status:'signed-in',usage:{windows:[{label:'5h',usedPercent:75}]}});service.client=async()=>({request:async()=>({account:null})});await service.refresh('default');assert.equal(service.publicList()[0].status,'signed-out');assert.deepEqual(service.publicList()[0].usage.windows,[]);});
function managedService(){return new AccountService({get:()=>({id:'a',managed:true}),list:()=>[{id:'a',managed:true}]},'unused');}
test('a delayed pre-login usage refresh cannot unlock a pending browser login',async()=>{
 const service=managedService();let releaseRates,enteredRates;
 const ratesEntered=new Promise(resolve=>enteredRates=resolve);
 service.client=async()=>({request:async method=>{
  if(method==='account/read')return {account:{type:'chatgpt',email:'old@example.test'}};
  if(method==='account/rateLimits/read'){enteredRates();return new Promise(resolve=>releaseRates=resolve);}
  if(method==='account/login/start')return {loginId:'pending-login',authUrl:'https://auth.openai.com/fixture'};
  return {};
 }});
 const refresh=service.refresh('a');await ratesEntered;await service.login('a');releaseRates({});await refresh;
 assert.equal(service.publicList()[0].status,'signing-in','Late quota responses cannot replace pending sign-in state');
 assert.equal(service.isLoginPending('a'),true);
 assert.equal(service.publicList()[0].loginId,undefined);assert.equal(service.publicList()[0].authUrl,undefined);
 await service.cancel('a');assert.equal(service.isLoginPending('a'),false);
});
test('refresh finishing after login completion cannot resurrect the pending login',async()=>{
 const service=managedService();let releaseRates,enteredRates;const entered=new Promise(resolve=>enteredRates=resolve);let holdRates=true;
 service.client=async()=>({request:async method=>{
  if(method==='account/login/start')return {loginId:'completed-login',authUrl:'https://auth.openai.com/fixture'};
  if(method==='account/read')return {account:{type:'chatgpt',email:'fixture@example.test'}};
  if(method==='account/rateLimits/read'&&holdRates){holdRates=false;enteredRates();return new Promise(resolve=>releaseRates=resolve);}return {};
 }});
 await service.login('a');const refresh=service.refresh('a');await entered;
 service.completeLogin('a',{loginId:'completed-login',success:true});assert.equal(service.isLoginPending('a'),false);
 releaseRates({});await refresh;assert.equal(service.isLoginPending('a'),false);assert.equal(service.publicList()[0].status,'signed-in');
 assert.equal(service.list()[0].loginId,undefined);assert.equal(service.list()[0].authUrl,undefined);
});
test('cancel waits for login startup and stale completion cannot unlock a newer login',async()=>{
 const service=managedService();let releaseStart;const cancelled=[];let first=true;
 service.client=async()=>({request:async(method,params)=>{
  if(method==='account/login/start'){if(first){first=false;return new Promise(resolve=>releaseStart=resolve);}return {loginId:'new-login',authUrl:'https://auth.openai.com/fixture'};}
  if(method==='account/login/cancel'){cancelled.push(params.loginId);return {};}
  if(method==='account/read')return {account:null};return {};
 }});
 const starting=service.login('a'),cancelling=service.cancel('a');await new Promise(resolve=>setImmediate(resolve));assert.equal(service.isLoginPending('a'),true);
 releaseStart({loginId:'old-login',authUrl:'https://auth.openai.com/fixture'});await Promise.all([starting,cancelling]);assert.deepEqual(cancelled,['old-login']);assert.equal(service.isLoginPending('a'),false);
 await service.login('a');service.completeLogin('a',{loginId:'old-login',success:true});assert.equal(service.isLoginPending('a'),true);
 service.completeLogin('a',{loginId:'new-login',success:false});assert.equal(service.isLoginPending('a'),false);assert.equal(service.publicList()[0].status,'signed-out');
});
test('failed startup unlocks only after provider teardown and failed cancellation keeps its guard',async()=>{
 const service=managedService();let releaseDispose,disposed;const disposing=new Promise(resolve=>disposed=resolve);let failStart=true,failCancel=true;
 service.client=async()=>({request:async method=>{
  if(method==='account/login/start'){if(failStart)throw Error('fixture start failed');return {loginId:'retry-login',authUrl:'https://auth.openai.com/fixture'};}
  if(method==='account/login/cancel'&&failCancel)throw Error('fixture cancel failed');return {};
 },dispose:async()=>{disposed();await new Promise(resolve=>releaseDispose=resolve);}});
 const failed=assert.rejects(service.login('a'),/fixture start failed/);await disposing;assert.equal(service.isLoginPending('a'),true);releaseDispose();await failed;assert.equal(service.isLoginPending('a'),false);
 failStart=false;await service.login('a');await assert.rejects(service.cancel('a'),/fixture cancel failed/);assert.equal(service.isLoginPending('a'),true);
 failCancel=false;await service.cancel('a');assert.equal(service.isLoginPending('a'),false);
});
test('completion received in the same provider batch as login start does not leave a stuck guard',async()=>{
 const service=managedService();service.client=async()=>({request:async method=>{
  if(method==='account/login/start'){service.completeLogin('a',{loginId:'fast-login',success:true});service.completeLogin('a',{loginId:'previous-login',success:false});return {loginId:'fast-login',authUrl:'https://auth.openai.com/fixture'};}
  if(method==='account/read')return {account:{type:'apiKey'}};return {};
 }});
 await service.login('a');assert.equal(service.isLoginPending('a'),false);assert.equal(service.list()[0].loginId,undefined);
});
