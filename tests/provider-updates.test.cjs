const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ProviderUpdates}=require('../src/main/provider-updates.cjs');

function temp(){return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'luce-provider-updates-')));}
function executable(file,contents=''){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents);fs.chmodSync(file,0o755);return file;}
function npmInstall(root,name,version){
 const packageRoot=path.join(root,'lib','node_modules',...name.split('/'));
 fs.mkdirSync(path.join(packageRoot,'bin'),{recursive:true});
 fs.writeFileSync(path.join(packageRoot,'package.json'),JSON.stringify({name,version,bin:{[name.split('/').at(-1)]:`bin/${name.split('/').at(-1)}.js`}}));
 const bin=path.join(packageRoot,'bin',`${name.split('/').at(-1)}.js`);fs.writeFileSync(bin,'');
 return {packageRoot,bin};
}
function fakeEnv(home,executables,extra={}){return {env:{HOME:home,PATH:path.join(home,'bin'),...extra},executables};}

test('npm providers query the installed package and install latest only when newer',async()=>{
 const home=temp();
 try{
  const prefix=path.join(home,'node');const {bin}=npmInstall(prefix,'@openai/codex','1.2.0');
  const link=executable(path.join(home,'bin','codex'));fs.unlinkSync(link);fs.symlinkSync(bin,link);
  const npm=executable(path.join(prefix,'bin','npm'));const calls=[];
  const updates=new ProviderUpdates(fakeEnv(home,{codex:link}),{runCommand:async(command,args,options)=>{
   calls.push({command,args,options});
   if(args[0]==='install')fs.writeFileSync(path.join(prefix,'lib','node_modules','@openai','codex','package.json'),JSON.stringify({name:'@openai/codex',version:'1.3.0'}));
   return {stdout:args[0]==='view'?'1.3.0':'',stderr:''};
  }});
  const result=await updates.run();
  assert.equal(result.codex.status,'updated');
  assert.equal(result.codex.installedVersion,'1.3.0');
  assert.equal(result.codex.latestVersion,'1.3.0');
  assert.deepEqual(calls.map(c=>[c.command,c.args]),[
   [npm,['view','@openai/codex','version','--json']],
   [npm,['install','--global','--prefix',prefix,'@openai/codex@latest']],
  ]);
  assert.equal(calls[0].options.timeout,30000);
  assert.equal(calls[1].options.timeout,120000);
  assert.equal(calls[0].options.env.PATH.split(path.delimiter)[0],path.join(prefix,'bin'));
  assert.equal(JSON.stringify(result).includes(home),false);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('npm providers do not reinstall an up-to-date version',async()=>{
 const home=temp();
 try{
  const prefix=path.join(home,'node');const {bin}=npmInstall(prefix,'@anthropic-ai/claude-code','2.4.0');
  const link=executable(path.join(home,'bin','claude'));fs.unlinkSync(link);fs.symlinkSync(bin,link);
  const npm=executable(path.join(prefix,'bin','npm'));let calls=0;
  const updates=new ProviderUpdates(fakeEnv(home,{claude:link}),{runCommand:async(command,args)=>{calls++;return {stdout:'2.4.0'};}});
  const result=await updates.run();
  assert.equal(result.claude.status,'current');
  assert.equal(calls,1);
  assert.equal(npm.endsWith('/npm'),true);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('npm update failures retain the verified installed version without command output',async()=>{
 const home=temp();
 try{
  const prefix=path.join(home,'node');const {bin}=npmInstall(prefix,'@openai/codex','1.2.0');
  const link=executable(path.join(home,'bin','codex'));fs.unlinkSync(link);fs.symlinkSync(bin,link);
  executable(path.join(prefix,'bin','npm'));
  const updates=new ProviderUpdates(fakeEnv(home,{codex:link}),{runCommand:async()=>{throw Object.assign(new Error(`offline at ${home}`),{stderr:'token=private'});}});
  const result=await updates.run();
  assert.equal(result.codex.status,'error');
  assert.equal(result.codex.installedVersion,'1.2.0');
  assert.equal(JSON.stringify(result).includes(home),false);
  assert.equal(JSON.stringify(result).includes('private'),false);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('npm reports an error when latest installation leaves the old package installed',async()=>{
 const home=temp();
 try{
  const prefix=path.join(home,'node');const {bin}=npmInstall(prefix,'@openai/codex','1.2.0');
  const link=executable(path.join(home,'bin','codex'));fs.unlinkSync(link);fs.symlinkSync(bin,link);
  executable(path.join(prefix,'bin','npm'));
  const updates=new ProviderUpdates(fakeEnv(home,{codex:link}),{runCommand:async(command,args)=>({stdout:args[0]==='view'?'1.3.0':''})});
  const result=await updates.run();
  assert.equal(result.codex.status,'error');
  assert.equal(result.codex.installedVersion,'1.2.0');
  assert.equal(result.codex.version,undefined);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('native Claude installation updates through its detected launcher',async()=>{
 const home=temp();
 try{
  const native=executable(path.join(home,'.local','share','claude','versions','2.1.0','claude'));
  const link=executable(path.join(home,'bin','claude'));fs.unlinkSync(link);fs.symlinkSync(native,link);
  const calls=[];let versionReads=0;
  const updates=new ProviderUpdates(fakeEnv(home,{claude:link}),{runCommand:async(command,args,options)=>{calls.push([command,args,options]);if(args[0]==='--version')return {stdout:`Claude Code ${++versionReads===1?'2.1.0':'2.2.0'}`};return {stdout:''};}});
  const result=await updates.run();
  assert.equal(result.claude.status,'updated');
  assert.equal(result.claude.version,'2.2.0');
  assert.deepEqual(calls.map(([command,args])=>[command,args]),[[link,['--version']],[link,['update']],[link,['--version']]]);
  assert.equal(calls[1][2].timeout,120000);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('Homebrew installations upgrade the matching cask',async()=>{
 const home=temp();
 try{
  const brewPrefix=path.join(home,'brew');
  const binary=executable(path.join(brewPrefix,'Caskroom','codex','1.0','bin','codex'));
  const link=executable(path.join(home,'bin','codex'));fs.unlinkSync(link);fs.symlinkSync(binary,link);
  const brew=executable(path.join(brewPrefix,'bin','brew'));const calls=[];let versionReads=0;
  const updates=new ProviderUpdates(fakeEnv(home,{codex:link}),{runCommand:async(command,args,options)=>{
   calls.push([command,args,options]);
   if(args[0]==='--version')return {stdout:`codex ${++versionReads===1?'1.0.0':'1.1.0'}`};
   return {stdout:''};
  }});
  const result=await updates.run();
  assert.equal(result.codex.status,'updated');
  assert.equal(result.codex.version,'1.1.0');
  assert.deepEqual(calls.map(([command,args])=>[command,args]),[[link,['--version']],[brew,['upgrade','--cask','codex']],[link,['--version']]]);
  assert.equal(calls[1][2].timeout,120000);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('Homebrew Cellar formula installations upgrade only the matching formula',async()=>{
 const home=temp();
 try{
  const brewPrefix=path.join(home,'brew');
  const codexBinary=executable(path.join(brewPrefix,'Cellar','codex','1.0','bin','codex'));
  const claudeBinary=executable(path.join(brewPrefix,'Cellar','claude-code','2.0','bin','claude'));
  const codexLink=executable(path.join(home,'bin','codex'));fs.unlinkSync(codexLink);fs.symlinkSync(codexBinary,codexLink);
  const claudeLink=executable(path.join(home,'bin','claude'));fs.unlinkSync(claudeLink);fs.symlinkSync(claudeBinary,claudeLink);
  const brew=executable(path.join(brewPrefix,'bin','brew'));const calls=[];let codexReads=0,claudeReads=0;
  const updates=new ProviderUpdates(fakeEnv(home,{codex:codexLink,claude:claudeLink}),{runCommand:async(command,args)=>{
   calls.push([command,args]);
   if(args[0]==='--version'){
    if(command===codexLink)return {stdout:`codex ${++codexReads===1?'1.0.0':'1.1.0'}`};
    return {stdout:`Claude Code ${++claudeReads===1?'2.0.0':'2.1.0'}`};
   }
   return {stdout:''};
  }});
  const result=await updates.run();
  assert.equal(result.codex.status,'updated');
  assert.equal(result.codex.version,'1.1.0');
  assert.equal(result.claude.status,'updated');
  assert.equal(result.claude.version,'2.1.0');
  assert.deepEqual(calls.filter(([,args])=>args[0]==='upgrade'),[
   [brew,['upgrade','--formula','codex']],
   [brew,['upgrade','--formula','claude-code']],
  ]);
  assert.equal(calls.some(([command,args])=>command.endsWith('/npm')&&args[0]==='install'),false);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('custom executable overrides are left untouched and update errors are safe and recoverable',async()=>{
 const home=temp();
 try{
  const custom=executable(path.join(home,'custom','claude'));
  const native=executable(path.join(home,'.local','share','claude','versions','1','claude'));
  const link=executable(path.join(home,'bin','claude'));fs.unlinkSync(link);fs.symlinkSync(native,link);
  let calls=0;
  const updates=new ProviderUpdates(fakeEnv(home,{codex:custom,claude:link},{LUCE_CODEX_EXECUTABLE:custom}),{runCommand:async(command,args)=>{calls++;if(args[0]==='--version')return {stdout:'Claude Code 1.2.0'};throw Object.assign(new Error(`secret ${home}`),{stderr:'token=secret'});}});
  const result=await updates.run();
  assert.equal(result.codex.status,'unsupported');
  assert.equal(result.claude.status,'error');
  assert.equal(result.claude.installedVersion,'1.2.0');
  assert.equal(JSON.stringify(result).includes(home),false);
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(calls,2);
  assert.equal((await updates.run()).claude.status,'error');
  assert.equal(calls,4);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('overlapping run calls share one pass and update disabling is respected',async()=>{
 const home=temp();
 try{
  const native=executable(path.join(home,'.local','share','claude','versions','1','claude'));
  const link=executable(path.join(home,'bin','claude'));fs.unlinkSync(link);fs.symlinkSync(native,link);
  let calls=0,release;
  const updates=new ProviderUpdates(fakeEnv(home,{claude:link}),{runCommand:(command,args)=>{if(args[0]==='--version')return Promise.resolve({stdout:'1.0.0'});calls++;return new Promise(resolve=>{release=()=>resolve({stdout:''});});}});
  assert.equal(updates.snapshot().claude.status,'idle');
  assert.equal(updates.snapshot().codex.status,'not-installed');
  const first=updates.run(),second=updates.run();
  assert.equal(first,second);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);release();
  assert.equal((await first).claude.status,'current');
  const disabled=new ProviderUpdates(fakeEnv(home,{claude:link},{DISABLE_UPDATES:'1'}),{runCommand:async()=>{throw new Error('should not run');}});
  assert.equal((await disabled.run()).claude.status,'unsupported');
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
