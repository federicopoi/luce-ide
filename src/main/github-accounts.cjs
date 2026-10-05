const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {spawn,execFile,execFileSync}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const DEVICE_URL='https://github.com/login/device';
const quote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
function text(value,label,max=100){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f<>]/.test(value))throw Error(`Enter a valid ${label}.`);return value.trim();}
function email(value){value=text(value,'commit email',254);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('Enter a valid commit email.');return value;}

class GitHubAccounts extends EventEmitter{
 constructor({directory,executable,env}){
  super();this.directory=directory;this.executable=executable;this.env=env;this.file=path.join(directory,'github-accounts.json');this.entries=[];this.states=new Map();this.logins=new Map();this.refreshes=new Map();this.disposed=false;
  try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));for(const row of saved.accounts||[]){if(!/^[a-f0-9-]{36}$/.test(row.id))continue;try{this.entries.push({id:row.id,name:text(row.name,'profile name',60),...(row.login&&/^[a-zA-Z0-9-]{1,39}$/.test(row.login)?{login:row.login}:{}),...(row.commitName?{commitName:text(row.commitName,'commit name')}:{}),...(row.commitEmail?{commitEmail:email(row.commitEmail)}:{})});}catch{}}}catch{}
 }
 list(){return this.entries.map(a=>({...a,status:this.executable?'signed-out':'unavailable',...this.states.get(a.id)}));}
 get(id){const a=this.list().find(a=>a.id===id);if(!a)throw Error('GitHub account not found.');return a;}
 configDirectory(id){this.get(id);return path.join(this.directory,'github-accounts',id);}
 save(){fs.mkdirSync(this.directory,{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({accounts:this.entries},null,2),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 changed(){if(!this.disposed)this.emit('changed');}
 add(name){if(!this.executable)throw Error('Install GitHub CLI (brew install gh), then restart Luce.');const a={id:randomUUID(),name:text(name,'profile name',60)};this.entries.push(a);fs.mkdirSync(this.configDirectory(a.id),{recursive:true,mode:0o700});this.save();this.changed();return this.get(a.id);}
 update(id,patch){this.get(id);if(!patch||typeof patch!=='object')throw Error('Invalid GitHub account settings.');const updates={};if(patch.name!==undefined)updates.name=text(patch.name,'profile name',60);if(patch.commitName!==undefined)updates.commitName=text(patch.commitName,'commit name');if(patch.commitEmail!==undefined)updates.commitEmail=email(patch.commitEmail);Object.assign(this.entries.find(a=>a.id===id),updates);this.save();this.changed();}
 authEnvironment(id,base=this.env){
  const env={...base,GH_CONFIG_DIR:this.configDirectory(id),GH_HOST:'github.com',GH_PROMPT_DISABLED:'1',GH_NO_UPDATE_NOTIFIER:'1',NO_COLOR:'1'};
  for(const key of ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GH_DEBUG'])delete env[key];
  return env;
 }
 async refresh(id){
  this.get(id);if(this.logins.has(id))return this.get(id);if(this.refreshes.has(id))return this.refreshes.get(id);
  const operation=this.check(id).finally(()=>this.refreshes.delete(id));this.refreshes.set(id,operation);return operation;
 }
 async check(id){
  if(!this.executable)return this.get(id);
  const previous=this.states.get(id);this.states.set(id,{status:'checking'});this.changed();
  try{
   const env=this.authEnvironment(id),options={env,timeout:10000,maxBuffer:256*1024};
   const {stdout}=await run(this.executable,['auth','status','--active','--hostname','github.com','--json','hosts'],options);
   const active=JSON.parse(stdout).hosts?.['github.com']?.find(a=>a.active&&a.state==='success');
   if(!active)throw Error();
   const user=JSON.parse((await run(this.executable,['api','user','--hostname','github.com'],options)).stdout);
   if(!/^[a-zA-Z0-9-]{1,39}$/.test(user.login)||user.login!==active.login||!Number.isSafeInteger(user.id)||user.id<1)throw Error();
   const entry=this.entries.find(a=>a.id===id);if(!entry||this.disposed)return;
   // A profile must never silently change to a different login behind a running project.
   if(entry.login&&entry.login!==user.login)throw Error();
   entry.login=user.login;entry.commitName ||= text(user.name||user.login,'commit name');entry.commitEmail ||= `${user.id}+${user.login}@users.noreply.github.com`;
   this.save();this.states.set(id,{status:'signed-in',credentialStorage:active.tokenSource==='keyring'?'keychain':'private-file'});
  }catch{if(this.entries.some(a=>a.id===id))this.states.set(id,{status:'signed-out',message:previous?.status==='signed-in'?'Could not verify GitHub access. Refresh or sign in again.':'Sign in to connect this GitHub account.'});}
  this.changed();return this.entries.some(a=>a.id===id)?this.get(id):null;
 }
 refreshAll(){return Promise.all(this.entries.map(a=>this.refresh(a.id)));}
 login(id){
  this.get(id);if(!this.executable)throw Error('Install GitHub CLI (brew install gh), then restart Luce.');if(this.logins.has(id)||this.refreshes.has(id))throw Error('Wait for the current GitHub sign-in or check to finish.');
  const child=spawn(this.executable,['auth','login','--hostname','github.com','--git-protocol','https','--web','--skip-ssh-key'],{env:this.authEnvironment(id),stdio:['ignore','pipe','pipe']});
  const login={child,tail:'',cancelled:false};this.logins.set(id,login);this.states.set(id,{status:'signing-in'});this.changed();
  const collect=data=>{login.tail=(login.tail+data.toString()).slice(-4096).replace(/\x1b\[[0-9;]*m/g,'');const match=login.tail.match(/one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);if(match&&!this.get(id).userCode&&!login.cancelled){this.states.set(id,{status:'signing-in',userCode:match[1].toUpperCase(),verificationURL:DEVICE_URL});this.changed();this.emit('device',{id,url:DEVICE_URL});}};
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  login.done=new Promise(resolve=>{
   let finished=false;const finish=async code=>{if(finished)return;finished=true;clearTimeout(login.timer);this.logins.delete(id);this.states.set(id,{status:'signed-out',message:login.cancelled?'Sign-in cancelled.':'GitHub sign-in did not complete. Try again.'});if(code===0&&!login.cancelled&&!this.disposed){const entry=this.entries.find(a=>a.id===id);if(entry)delete entry.login;await this.refresh(id);}else this.changed();resolve();};
   child.once('error',()=>finish(1));child.once('close',finish);
  });
  login.timer=setTimeout(()=>{login.cancelled=true;child.kill('SIGKILL');},15*60*1000);login.timer.unref();return this.get(id);
 }
 async cancel(id){this.get(id);const login=this.logins.get(id);if(!login)return;login.cancelled=true;login.child.kill('SIGKILL');await login.done;}
 remove(id){this.get(id);if(this.logins.has(id)||this.refreshes.has(id))throw Error('Finish or cancel this GitHub sign-in/check first.');this.entries=this.entries.filter(a=>a.id!==id);this.states.delete(id);this.save();this.changed();}
 environment(id,base=this.env){
  if(!id||id==='default')return {...base};const account=this.get(id);if(account.status!=='signed-in')throw Error(`Sign in to ${account.name} in Accounts → GitHub first.`);
  const env=this.authEnvironment(id,base);let token;
  try{token=execFileSync(this.executable,['auth','token','--hostname','github.com','--user',account.login],{env,encoding:'utf8',timeout:5000,maxBuffer:16384,stdio:['ignore','pipe','pipe']}).trim();if(!token||/[\s\x00-\x1f]/.test(token))throw Error();}catch{throw Error(`GitHub credentials for ${account.name} are unavailable. Sign in again.`);}
  // Pin a specific user's token, independent of gh's shared active Keychain slot.
  env.GH_TOKEN=token;
  for(const key of ['GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN'])if(base[key])env[key]=base[key];
  const pairs=[['credential.https://github.com.helper',''],['credential.https://github.com.helper',`!${quote(this.executable)} auth git-credential`],['credential.https://github.com.username',account.login],['credential.https://github.com.useHttpPath','false'],...['git@github.com:','ssh://git@github.com/','ssh://git@github.com:22/'].map(prefix=>['url.https://github.com/.insteadOf',prefix])];
  let count=Number(env.GIT_CONFIG_COUNT||0);if(!Number.isInteger(count)||count<0||count>1000)throw Error('Invalid inherited Git configuration.');
  for(const [key,value]of pairs){env[`GIT_CONFIG_KEY_${count}`]=key;env[`GIT_CONFIG_VALUE_${count++}`]=value;}env.GIT_CONFIG_COUNT=String(count);
  // Git parses inherited -c parameters after GIT_CONFIG_COUNT; our entries must win there too.
  if(env.GIT_CONFIG_PARAMETERS)env.GIT_CONFIG_PARAMETERS+=' '+pairs.map(([key,value])=>quote(`${key}=${value}`)).join(' ');
  Object.assign(env,{GIT_AUTHOR_NAME:account.commitName,GIT_COMMITTER_NAME:account.commitName,GIT_AUTHOR_EMAIL:account.commitEmail,GIT_COMMITTER_EMAIL:account.commitEmail});return env;
 }
 dispose(){this.disposed=true;for(const login of this.logins.values()){login.cancelled=true;clearTimeout(login.timer);login.child.kill('SIGKILL');}return Promise.all([...this.logins.values()].map(login=>login.done));}
}
module.exports={GitHubAccounts};
