const {spawn}=require('node:child_process');
function createCodexThread(executable,cwd,env){
 if(!executable)return Promise.reject(Error('Codex is not installed or could not be found.'));
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,['app-server','--stdio'],{cwd,env,detached:true,stdio:['pipe','pipe','ignore']});let buffer='',threadId=null,failure=null,settled=false,shutdown;
  const terminate=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{try{child.kill('SIGTERM');}catch{}}};
  const timer=setTimeout(()=>{failure=Error('Codex took too long to create a conversation. Check codex doctor from a shell.');terminate();},20000);
  const send=message=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(message)+'\n');};
  child.stdin.on('error',()=>{});
  child.on('error',error=>{failure=error;clearTimeout(timer);clearTimeout(shutdown);settled=true;reject(error);});
  child.on('close',()=>{clearTimeout(timer);clearTimeout(shutdown);if(settled)return;settled=true;if(threadId&&!failure)resolve(threadId);else reject(failure||Error('Codex could not create a conversation. Check your Codex login and configuration.'));});
  child.stdout.on('data',data=>{buffer+=data;if(buffer.length>4*1024*1024){failure=Error('Codex returned an oversized startup response.');terminate();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let message;try{message=JSON.parse(line);}catch{continue;}
   if(message.error){failure=Error(message.error.message||'Codex could not create the conversation.');terminate();return;}
   if(message.id===1){send({method:'initialized',params:{}});send({id:2,method:'thread/start',params:{cwd,ephemeral:false}});}
   if(message.id===2){const id=message.result?.thread?.id;if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(id)){failure=Error('Codex returned an invalid conversation ID.');terminate();return;}threadId=id;child.stdin.end();shutdown=setTimeout(terminate,1500);}
  }});
  send({id:1,method:'initialize',params:{clientInfo:{name:'orbit',title:'Orbit',version:'0.1.0'}}});
 });
}
module.exports={createCodexThread};
