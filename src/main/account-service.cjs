const {CodexClient}=require('./codex-client.cjs');const {codexUsage}=require('./usage.cjs');const {EventEmitter}=require('node:events');
class AccountService extends EventEmitter {
 constructor(accounts,file){super();this.accounts=accounts;this.file=file;this.clients=new Map();this.status=new Map();this.loading=new Map();this.pendingLogins=new Map();}
 list(){return this.accounts.list().map(a=>{const login=this.pendingLogins.get(a.id);return {...a,...(this.status.get(a.id)||{status:'checking',usage:{windows:[]}}),...(login?{status:'signing-in',loginId:login.loginId,authUrl:login.authUrl,message:'Finish signing in in your browser.'}:{})};});}
 isLoginPending(id){return this.pendingLogins.has(id);}
 completeLogin(id,result){const login=this.pendingLogins.get(id);if(!login)return;if(!login.loginId){if(typeof result?.loginId==='string')login.completions.set(result.loginId,result);return;}if(result?.loginId!==login.loginId)return;this.pendingLogins.delete(id);const s=this.status.get(id)||{};s.status=result.success?'checking':'signed-out';s.message=result.success?'':'Sign-in did not complete. Try again.';this.status.set(id,s);this.emit('changed');setImmediate(()=>this.refresh(id));}
 async client(id){this.accounts.get(id);let c=this.clients.get(id);if(!c||c.closed){c=new CodexClient({file:this.file,env:this.accounts.environment(id),args:this.accounts.args(id)});this.clients.set(id,c);c.on('notification',m=>{if(m.method==='account/login/completed')this.completeLogin(id,m.params);if(m.method==='account/rateLimits/updated'){const s=this.status.get(id)||{};s.usage=codexUsage(m.params);this.status.set(id,s);this.emit('changed');}});}await c.ready();return c;}
 async refresh(id){if(this.loading.has(id))return this.loading.get(id);const work=(async()=>{const old=this.status.get(id)||{};try{const c=await this.client(id),r=await c.request('account/read',{refreshToken:false}),a=r.account;const next={status:a?'signed-in':'signed-out',email:a?.email||'',plan:a?.planType||'',authType:a?.type||'',usage:a?.type==='chatgpt'?(old.email===a.email&&old.authType===a.type?(old.usage||{windows:[]}):{windows:[]}):{windows:[]}};if(a?.type==='chatgpt')try{next.usage=codexUsage(await c.request('account/rateLimits/read'));}catch{next.usage={...next.usage,stale:true};next.message='Usage unavailable. Refresh to retry.';}else next.message=a?'Subscription usage is unavailable for this login type.':'Sign in to use this account.';this.status.set(id,next);}catch{this.status.set(id,{...old,status:'unavailable',message:'Could not connect to Codex. Refresh to retry.',usage:{...(old.usage||{windows:[]}),stale:true}});}this.emit('changed');})().finally(()=>this.loading.delete(id));this.loading.set(id,work);return work;}
 async refreshAll(){await Promise.all(this.accounts.list().map(a=>this.refresh(a.id)));return this.list();}
 async login(id){
  const entry=this.accounts.get(id);if(!entry.managed)throw Error('The existing login is shared with your other Codex terminals. Add a separate account to sign in without replacing it.');
  if(this.isLoginPending(id))throw Error('Finish or cancel this account’s sign-in first.');
  const login={completions:new Map()};this.pendingLogins.set(id,login);let c;
  login.starting=(async()=>{
   c=await this.client(id);const r=await c.request('account/login/start',{type:'chatgpt'});
   if(typeof r.loginId!=='string'||!r.loginId)throw Error('Codex returned an invalid sign-in identifier.');
   login.loginId=r.loginId;const u=new URL(r.authUrl);
   if(u.protocol!=='https:'||!['auth.openai.com','chatgpt.com','auth.chatgpt.com'].includes(u.hostname)||u.username||u.password)throw Error('Codex returned an unsupported sign-in URL.');
   login.authUrl=u.href;return u.href;
  })();
  this.emit('changed');
  try{const url=await login.starting;const completion=login.completions.get(login.loginId);login.completions.clear();if(completion)this.completeLogin(id,completion);this.emit('changed');return url;}
  catch(error){
   // An unknown login/start outcome must stop its owned authentication process
   // before account use is unlocked; it could otherwise complete after timeout.
   await c?.dispose();if(this.pendingLogins.get(id)===login)this.pendingLogins.delete(id);
   this.status.set(id,{status:'unavailable',message:'Sign-in could not start. Try again.',usage:{windows:[]}});this.emit('changed');throw error;
  }
 }
 async cancel(id){
  const login=this.pendingLogins.get(id);if(!login)return;
  try{await login.starting;}catch{return;}
  if(this.pendingLogins.get(id)!==login)return;
  const c=await this.client(id);await c.request('account/login/cancel',{loginId:login.loginId});
  if(this.pendingLogins.get(id)===login){this.pendingLogins.delete(id);const s=this.status.get(id)||{};s.status='signed-out';this.status.set(id,s);this.emit('changed');}
 }
 async remove(id){if(!this.accounts.get(id).managed)throw Error('The existing account cannot be removed.');await this.cancel(id);await this.clients.get(id)?.dispose();this.clients.delete(id);this.status.delete(id);this.accounts.remove(id);this.emit('changed');}
 publicList(){return this.list().map(({loginId,authUrl,...a})=>a);}
 async dispose(){await Promise.all([...this.clients.values()].map(c=>c.dispose()));this.pendingLogins.clear();}
}
module.exports={AccountService};
