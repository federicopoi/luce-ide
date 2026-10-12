const fsDefault=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {EventEmitter}=require('node:events');

const execFileAsync=promisify(execFile);
const PACKAGES={codex:'@openai/codex',claude:'@anthropic-ai/claude-code'};
const EXECUTABLE_OVERRIDES={codex:'LUCE_CODEX_EXECUTABLE',claude:'LUCE_CLAUDE_EXECUTABLE'};
const COMMAND_TIMEOUT_MS=30000;
const UPDATE_TIMEOUT_MS=120000;

function versionParts(value){
 const match=String(value||'').trim().match(/^[v=]?([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
 if(!match)return null;
 return {numbers:match.slice(1,4).map(Number),pre:match[4]?match[4].split('.'):null};
}
function compareVersions(a,b){
 const left=versionParts(a),right=versionParts(b);if(!left||!right)return null;
 for(let i=0;i<3;i++)if(left.numbers[i]!==right.numbers[i])return left.numbers[i]<right.numbers[i]?-1:1;
 if(left.pre===null&&right.pre===null)return 0;
 if(left.pre===null)return 1;if(right.pre===null)return -1;
 for(let i=0;i<Math.max(left.pre.length,right.pre.length);i++){
  if(left.pre[i]===undefined)return -1;if(right.pre[i]===undefined)return 1;
  if(left.pre[i]===right.pre[i])continue;
  const ln=/^\d+$/.test(left.pre[i]),rn=/^\d+$/.test(right.pre[i]);
  if(ln&&rn)return Number(left.pre[i])<Number(right.pre[i])?-1:1;
  if(ln!==rn)return ln?-1:1;
  return left.pre[i]<right.pre[i]?-1:1;
 }
 return 0;
}
function isExecutable(file,fs){try{return fs.statSync(file).isFile()&&(process.platform==='win32'||(fs.statSync(file).mode&0o111)!==0);}catch{return false;}}
function findOnPath(name,env,fs){
 for(const directory of String(env.PATH||'').split(path.delimiter)){
  const candidate=path.join(directory,name);if(isExecutable(candidate,fs))return candidate;
 }
 return null;
}
function packageInstall(executable,packageName,fs){
 let current=path.dirname(executable);
 for(let i=0;i<12;i++){
  const manifest=path.join(current,'package.json');
  try{
   const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
   if(data.name===packageName&&typeof data.version==='string'){
    let nodeModules=current;
    while(path.basename(nodeModules)!=='node_modules'&&path.dirname(nodeModules)!==nodeModules)nodeModules=path.dirname(nodeModules);
    if(path.basename(nodeModules)!=='node_modules')return null;
    const prefix=path.basename(path.dirname(nodeModules))==='lib'?path.dirname(path.dirname(nodeModules)):path.dirname(nodeModules);
    return {root:current,version:data.version,prefix};
   }
  }catch{}
  const parent=path.dirname(current);if(parent===current)break;current=parent;
 }
 return null;
}
function safeStatus(provider,status,fields={}){
 return {provider,status,...fields};
}

class ProviderUpdates extends EventEmitter{
 constructor(environment={},options={}){
  super();this.environment=environment||{};this.env={...(environment.env||process.env)};this.executables={...(environment.executables||{})};
  this.fs=options.fs||fsDefault;this.runCommand=options.runCommand||((command,args,commandOptions={})=>execFileAsync(command,args,{timeout:COMMAND_TIMEOUT_MS,maxBuffer:1024*1024,windowsHide:true,...commandOptions}));
  this.running=null;this.statuses={
   codex:safeStatus('codex',this.executables.codex?'idle':'not-installed'),
   claude:safeStatus('claude',this.executables.claude?'idle':'not-installed'),
  };
 }
 snapshot(){return {codex:{...this.statuses.codex},claude:{...this.statuses.claude}};}
 publish(provider,status,fields={}){this.statuses[provider]=safeStatus(provider,status,fields);this.emit('status',{...this.statuses[provider]});}
 run(){if(this.running)return this.running;this.running=this.updateAll().finally(()=>{this.running=null;});return this.running;}
 async updateAll(){
  for(const provider of ['codex','claude']){
   this.publish(provider,'checking');
   try{await this.updateProvider(provider);}catch{
    const installedVersion=this.statuses[provider].installedVersion;
    this.publish(provider,'error',{...(installedVersion?{installedVersion}:{}),message:'Update check failed. Luce will continue using the installed version.'});
   }
  }
  return this.snapshot();
 }
 async updateProvider(provider){
  const executable=this.executables[provider];
  if(!executable){this.publish(provider,'not-installed');return;}
  const override=EXECUTABLE_OVERRIDES[provider];
  if((this.env[override]&&path.resolve(this.env[override])===path.resolve(executable))||(this.env[override]&&provider==='codex')||(this.env[override]&&provider==='claude')){
   this.publish(provider,'unsupported',{message:'Updates are unavailable for this custom installation.'});return;
  }
  if(provider==='claude'&&/^(1|true|yes)$/i.test(String(this.env.DISABLE_UPDATES||''))){this.publish(provider,'unsupported',{message:'Claude updates are disabled.'});return;}
  let real;
  try{real=this.fs.realpathSync(executable);}catch{this.publish(provider,'unsupported',{message:'Updates are unavailable for this installation.'});return;}
  const home=this.env.HOME||this.env.USERPROFILE||'';
  let resolvedHome=home;
  try{if(home)resolvedHome=this.fs.realpathSync(home);}catch{}
  if(provider==='claude'&&resolvedHome&&real.startsWith(path.join(resolvedHome,'.local','share','claude','versions')+path.sep)){
   await this.updateNativeClaude(executable);return;
  }
  const brew=this.homebrewInstall(real,provider);
  if(brew){await this.updateHomebrew(brew,executable,provider);return;}
  const installed=packageInstall(real,PACKAGES[provider],this.fs);
  if(installed){await this.updateNpm(provider,installed);return;}
  this.publish(provider,'unsupported',{message:'Updates are unavailable for this installation.'});
 }
 homebrewInstall(real,provider){
  const components=real.split(path.sep);
  const caskIndex=components.findIndex((part,i)=>part==='Caskroom'&&components[i+1]);
  const cellarIndex=components.findIndex((part,i)=>part==='Cellar'&&components[i+1]);
  let kind,name,index;
  if(caskIndex>=0){kind='cask';name=components[caskIndex+1];index=caskIndex;
   if(provider==='codex'&&name!=='codex')return null;
   if(provider==='claude'&&!/^claude-code(?:@latest)?$/.test(name))return null;
  }else if(cellarIndex>=0){kind='formula';name=components[cellarIndex+1];index=cellarIndex;
   if(provider==='codex'&&name!=='codex')return null;
   if(provider==='claude'&&name!=='claude-code')return null;
  }else return null;
  const prefix=path.resolve(path.sep,...components.slice(1,index));
  const brew=path.join(prefix,'bin','brew');if(!isExecutable(brew,this.fs))return null;
  return {brew,name,kind};
 }
 async updateNpm(provider,installed){
  const npmInPrefix=path.join(installed.prefix,'bin',process.platform==='win32'?'npm.cmd':'npm');
  const npm=isExecutable(npmInPrefix,this.fs)?npmInPrefix:findOnPath(process.platform==='win32'?'npm.cmd':'npm',this.env,this.fs);
  if(!npm){this.publish(provider,'unsupported',{installedVersion:installed.version,message:'Updates are unavailable for this installation.'});return;}
  this.publish(provider,'checking',{version:installed.version,installedVersion:installed.version});
  const packageName=PACKAGES[provider];
  const commandEnv={...this.env,PATH:[path.join(installed.prefix,'bin'),this.env.PATH||''].filter(Boolean).join(path.delimiter),ELECTRON_RUN_AS_NODE:'1'};
  const {stdout}=await this.runCommand(npm,['view',packageName,'version','--json'],{env:commandEnv,timeout:COMMAND_TIMEOUT_MS});
  const latest=String(stdout||'').trim().replace(/^"|"$/g,'');
  const comparison=compareVersions(latest,installed.version);
  if(comparison===null)throw new Error('Could not compare package versions');
  if(comparison<=0){this.publish(provider,'current',{version:installed.version,installedVersion:installed.version,latestVersion:latest});return;}
  this.publish(provider,'updating',{version:installed.version,installedVersion:installed.version,latestVersion:latest});
  await this.runCommand(npm,['install','--global','--prefix',installed.prefix,`${packageName}@latest`],{env:commandEnv,timeout:UPDATE_TIMEOUT_MS});
  const manifest=JSON.parse(this.fs.readFileSync(path.join(installed.root,'package.json'),'utf8'));
  const verifiedVersion=typeof manifest.version==='string'&&versionParts(manifest.version)?manifest.version:null;
  if(!verifiedVersion)throw new Error('Could not verify installed package version');
  if(compareVersions(verifiedVersion,latest)<0||compareVersions(verifiedVersion,installed.version)<=0)throw new Error('Installed package did not reach the requested version');
  const updated=compareVersions(verifiedVersion,installed.version)>0;
  this.publish(provider,updated?'updated':'current',{version:verifiedVersion,installedVersion:verifiedVersion,latestVersion:latest});
 }
 async readExecutableVersion(executable){
  try{
   const {stdout}=await this.runCommand(executable,['--version'],{env:{...this.env,ELECTRON_RUN_AS_NODE:'1'},timeout:COMMAND_TIMEOUT_MS});
   return String(stdout||'').match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/)?.[0]||null;
  }catch{return null;}
 }
 async updateNativeClaude(launcher){
  const env={...this.env,ELECTRON_RUN_AS_NODE:'1'};
  const beforeVersion=await this.readExecutableVersion(launcher);
  this.publish('claude','updating',beforeVersion?{version:beforeVersion,installedVersion:beforeVersion}:{});
  await this.runCommand(launcher,['update'],{env,timeout:UPDATE_TIMEOUT_MS});
  const afterVersion=await this.readExecutableVersion(launcher);
  if(!afterVersion)throw new Error('Could not verify Claude version after update');
  const changed=beforeVersion===null||compareVersions(afterVersion,beforeVersion)!==0;
  this.publish('claude',changed?'updated':'current',{version:afterVersion,installedVersion:afterVersion});
 }
 async updateHomebrew({brew,name,kind},executable,provider){
  const beforeVersion=await this.readExecutableVersion(executable);
  this.publish(provider,'updating',beforeVersion?{version:beforeVersion,installedVersion:beforeVersion}:{});
  await this.runCommand(brew,['upgrade',`--${kind}`,name],{env:{...this.env,ELECTRON_RUN_AS_NODE:'1'},timeout:UPDATE_TIMEOUT_MS});
  const afterVersion=await this.readExecutableVersion(executable);
  if(!afterVersion)throw new Error('Could not verify provider version after Homebrew upgrade');
  const changed=beforeVersion===null||compareVersions(afterVersion,beforeVersion)!==0;
  this.publish(provider,changed?'updated':'current',{version:afterVersion,installedVersion:afterVersion});
 }
}

module.exports={ProviderUpdates,compareVersions};
