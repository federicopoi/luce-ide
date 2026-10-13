const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {CREDENTIAL_KEYS}=require('./cloudflare-accounts.cjs');
const {stopTree}=require('./processes.cjs');

// Wrangler 4.71+ supports whoami --json and auth token --json.
// Its legacy HOME/.wrangler path precedes XDG; isolate both for auth children only.
class CloudflareAuth{
 constructor({directory,executable,env,timeoutMs=900000}){this.directory=path.join(directory,'cloudflare-profiles');this.executable=executable;this.env=env;this.timeoutMs=timeoutMs;this.active=null;this.jobs=new Set();this.disposed=false;}
 get available(){return !!this.executable;}
 environment(id){if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('Invalid Cloudflare profile.');const home=path.join(this.directory,id);fs.mkdirSync(path.join(home,'.wrangler'),{recursive:true,mode:0o700});fs.chmodSync(home,0o700);fs.chmodSync(path.join(home,'.wrangler'),0o700);const log=path.join(home,'.wrangler','luce-auth.log');if(!fs.existsSync(log))fs.symlinkSync('/dev/null',log);if(!fs.lstatSync(log).isSymbolicLink()||fs.readlinkSync(log)!=='/dev/null')throw Error('Cloudflare log isolation is unavailable.');const env={...this.env};for(const key of [...CREDENTIAL_KEYS,'NODE_OPTIONS','WRANGLER_LOG','WRANGLER_LOG_PATH','WRANGLER_AUTH_DOMAIN','WRANGLER_AUTH_URL','WRANGLER_TOKEN_URL','CLOUDFLARE_API_BASE_URL','WRANGLER_API_BASE_URL','BROWSER'])delete env[key];return {...env,HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(home,'.config'),XDG_DATA_HOME:path.join(home,'.local/share'),XDG_CACHE_HOME:path.join(home,'.cache'),WRANGLER_SEND_METRICS:'false',WRANGLER_LOG:'log',WRANGLER_LOG_PATH:log,WRANGLER_LOG_SANITIZE:'true',NO_COLOR:'1'};}
 run(id,args,timeout){
  if(!this.available)throw Error('Install Wrangler (npm install -g wrangler), then restart Luce.');
  if(this.disposed)throw Error('Cloudflare sign-in cancelled.');
  const env=this.environment(id),child=spawn(this.executable,args,{env,cwd:env.HOME,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let output='',size=0,timer,settled=false,stopping=false,stopPromise;
  const job={id,child};this.jobs.add(job);
  const closed=new Promise(resolve=>{child.once('close',resolve);child.once('error',resolve);});
  job.done=new Promise((resolve,reject)=>{
   const finish=ok=>{
    if(settled||stopping)return;settled=true;clearTimeout(timer);this.jobs.delete(job);
    if(ok)resolve(output);
    else reject(Error(job.cancelled?'Cloudflare sign-in cancelled.':job.timedOut?'Cloudflare sign-in timeout. Try again.':'Cloudflare command failed. Sign in again, or update Wrangler to version 4.71 or later.'));
   };
   job.stop=reason=>{
    if(stopPromise)return stopPromise;
    if(settled)return Promise.resolve();
    if(reason==='cancel')job.cancelled=true;if(reason==='timeout')job.timedOut=true;
    stopping=true;clearTimeout(timer);
    stopPromise=(async()=>{
     try{if(child.pid)await stopTree(child.pid);}
     catch{
      // The dedicated process group also covers a Wrangler launcher child if
      // process enumeration is unavailable. Never signal Luce's process group.
      try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}
     }
     await closed;stopping=false;finish(false);
    })();
    return stopPromise;
   };
   const collect=(data,stdout)=>{if(stopping)return;size+=data.length;if(size>256*1024)void job.stop('overflow');else if(stdout)output+=data;};
   child.stdout.on('data',data=>collect(data,true));child.stderr.on('data',data=>collect(data,false));
   child.once('error',()=>finish(false));child.once('close',code=>finish(code===0));
   timer=setTimeout(()=>void job.stop('timeout'),timeout);timer.unref();
  });
  job.done.catch(()=>{});return job;
 }
 async json(id,args){try{const text=await this.run(id,args,15000).done;return JSON.parse(text);}catch{throw Error('Could not read Cloudflare credentials. Sign in again, or update Wrangler to version 4.71 or later.');}}
 async identity(id){const value=await this.json(id,['whoami','--json']);if(value?.loggedIn!==true||typeof value.email!=='string'||!Array.isArray(value.accounts))throw Error('Could not verify Cloudflare identity.');return {email:value.email,accounts:value.accounts.map(a=>({id:a.id,name:a.name}))};}
 async token(id){const value=await this.json(id,['auth','token','--json']);if(value?.type!=='oauth'||typeof value.token!=='string'||!value.token||value.token.length>16384||/[\s\x00-\x1f]/.test(value.token))throw Error('Cloudflare OAuth credentials are unavailable. Sign in again.');return value.token;}
 async login(id){
  if(this.active)throw Error('Finish or cancel the current Cloudflare sign-in first.');
  const job=this.run(id,['login'],this.timeoutMs);this.active=job;
  try{
   await job.done;if(job.cancelled||this.disposed)throw Error('Cloudflare sign-in cancelled.');
   const identity=await this.identity(id);
   if(job.cancelled||this.disposed)throw Error('Cloudflare sign-in cancelled.');
   return identity;
  }catch(error){if(job.cancelled||this.disposed)throw Error('Cloudflare sign-in cancelled.');throw error;}
  finally{if(this.active===job)this.active=null;}
 }
 async cancel(id){
  if(this.active?.id!==id)return;
  this.active.cancelled=true;
  const jobs=[...this.jobs].filter(job=>job.id===id);
  await Promise.all(jobs.map(job=>job.stop('cancel')));
 }
 async dispose(){
  this.disposed=true;if(this.active)this.active.cancelled=true;
  await Promise.all([...this.jobs].map(job=>job.stop('cancel')));
 }
}
module.exports={CloudflareAuth};
