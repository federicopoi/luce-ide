const {execFile}=require('node:child_process');const {promisify}=require('node:util');const execute=promisify(execFile);
async function currentDirectory(pid,fallback){
 if(!Number.isInteger(pid)||pid<=0)return fallback;
 try{const {stdout}=await execute('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{timeout:1200,maxBuffer:64*1024});const name=stdout.split('\n').find(line=>line.startsWith('n/'));return name?name.slice(1):fallback;}catch{return fallback;}
}
class TerminalDirectories{
 constructor(){this.cache=new Map();}
 invalidate(id){this.cache.delete(id);}
 get(session){const cached=this.cache.get(session.id);if(cached&&Date.now()-cached.time<500)return cached.promise;const promise=currentDirectory(session.child?.pid,session.workingDirectory);this.cache.set(session.id,{time:Date.now(),promise});return promise;}
}
module.exports={currentDirectory,TerminalDirectories};
