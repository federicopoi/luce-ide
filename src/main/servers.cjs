const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const http=require('node:http'),https=require('node:https');
const execute=promisify(execFile);
function reachable(input){
 let url;try{url=new URL(input);}catch{return Promise.resolve(false);}
 if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)return Promise.resolve(false);
 return new Promise(resolve=>{
  let settled=false;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);request.destroy();resolve(value);};
  const request=(url.protocol==='https:'?https:http).request(url,{method:'HEAD'},response=>{response.resume();finish(true);});
  const timer=setTimeout(()=>finish(false),1200);request.on('error',()=>finish(false));request.end();
 });
}
async function findLocalServers(directories){
 const result=new Map();if(!directories.length)return result;
 let output;try{output=(await execute('/usr/sbin/lsof',['-nP','-iTCP','-sTCP:LISTEN','-Fpn'],{timeout:4000,maxBuffer:1024*1024})).stdout;}catch{return result;}
 const ports=new Map();let pid;
 for(const line of output.split('\n')){
  if(line[0]==='p'){pid=line.slice(1);if(!ports.has(pid))ports.set(pid,new Set());}
  if(line[0]==='n'&&pid){const match=line.match(/:(\d+)$/);if(match)ports.get(pid).add(Number(match[1]));}
 }
 if(!ports.size)return result;
 let cwdOutput;try{cwdOutput=(await execute('/usr/sbin/lsof',['-a','-p',[...ports.keys()].join(','),'-d','cwd','-Fpn'],{timeout:4000,maxBuffer:1024*1024})).stdout;}catch{return result;}
 const wanted=new Set(directories),candidates=[];
 for(const line of cwdOutput.split('\n')){if(line[0]==='p')pid=line.slice(1);else if(line[0]==='n'&&wanted.has(line.slice(1)))for(const port of ports.get(pid)||[])candidates.push({directory:line.slice(1),url:`http://localhost:${port}/`});}
 await Promise.all(candidates.slice(0,100).map(async candidate=>{if(await reachable(candidate.url))result.set(candidate.directory,candidate.url);}));return result;
}
module.exports={findLocalServers,reachable};
