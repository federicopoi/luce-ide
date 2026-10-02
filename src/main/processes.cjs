const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function exists(pid){try{process.kill(pid,0);return true;}catch{return false;}}
function signal(pid,name){try{process.kill(pid,name);}catch(error){if(error.code!=='ESRCH')throw error;}}
async function ownedTree(root){
 const {stdout}=await execute('/bin/ps',['-axo','pid=,ppid='],{timeout:2000});const entries=stdout.trim().split('\n').map(row=>row.trim().split(/\s+/).map(Number));let result=[root];
 for(let index=0;index<result.length;index++)for(const [pid,parent]of entries)if(parent===result[index]&&!result.includes(pid))result.push(pid);return result;
}
async function stopTree(pid){
 const pids=await ownedTree(pid);for(const child of [...pids].reverse())signal(child,'SIGTERM');
 const deadline=Date.now()+600;while(Date.now()<deadline&&pids.some(exists))await pause(40);
 // Stop descendants first so a living parent can reap them before its own exit.
 for(const child of pids.slice(1).reverse())if(exists(child))signal(child,'SIGKILL');if(pids.length>1)await pause(100);
 if(exists(pid))signal(pid,'SIGKILL');
 const final=Date.now()+1500;while(Date.now()<final&&pids.some(exists))await pause(40);
 if(exists(pid))throw Error('The terminal process did not stop. Try closing it again.');
}
module.exports={stopTree};
