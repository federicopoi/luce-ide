#!/usr/bin/env node
// Deterministic local provider for Electron tests; never contacts a service.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const home=process.env.CODEX_HOME,args=process.argv.slice(2),personal=home.includes('codex-accounts');fs.mkdirSync(path.join(home,'sessions'),{recursive:true});
function files(){return fs.readdirSync(path.join(home,'sessions'),{recursive:true}).filter(f=>f.endsWith('.jsonl')).map(f=>path.join(home,'sessions',f));}
function saved(id){return files().some(file=>fs.readFileSync(file,'utf8').includes(id));}
if(args.includes('app-server')){
 const rl=require('node:readline').createInterface({input:process.stdin});const send=m=>console.log(JSON.stringify(m));
 rl.on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result={};switch(r.method){
 case 'account/read':result={account:!personal||fs.existsSync(path.join(home,'auth.json'))?{type:'chatgpt',email:personal?'personal@example.test':'work@example.test',planType:'plus'}:null};break;
 case 'account/rateLimits/read':result={rateLimits:{primary:{usedPercent:personal?22:70,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600},secondary:{usedPercent:personal?10:55,windowDurationMins:10080,resetsAt:Math.floor(Date.now()/1000)+86400}}};break;
 case 'account/login/start':result={type:'chatgpt',loginId:'fixture-login',authUrl:'https://auth.openai.com/luce-fixture'};setTimeout(()=>{fs.writeFileSync(path.join(home,'auth.json'),'fixture-auth-no-real-tokens',{mode:0o600});send({method:'account/login/completed',params:{success:true,loginId:'fixture-login'}});},250);break;
 case 'thread/read':if(fs.existsSync(path.join(home,'unsupported'))||!saved(r.params.threadId)){send({id:r.id,error:{message:'Unsupported fixture history'}});return;}result={thread:{id:r.params.threadId,turns:[{id:'turn-1'}]}};break;
 }
 send({id:r.id,result});
 });
}else{
 const remoteAt=args.indexOf('--remote');if(remoteAt>=0&&!args[remoteAt+1]?.startsWith('unix://')){console.error('ERROR: unsupported remote transport');process.exit(2);}
 const at=args.indexOf('resume'),id=at>=0?args[at+1]:randomUUID();if(at>=0&&!saved(id)){console.log('ERROR: No saved session found');process.exit(1);}if(at<0){const timestamp=new Date().toISOString();fs.writeFileSync(path.join(home,'sessions','rollout-'+id+'.jsonl'),[{timestamp,type:'session_meta',payload:{id,cwd:process.cwd(),timestamp,source:'cli'}},{timestamp,type:'response_item',payload:{role:'user',content:[{type:'input_text',text:'Fixture conversation context'}]}}].map(JSON.stringify).join('\n')+'\n');}
 console.log('FIXTURE_READY '+id+' HOME='+home);process.stdin.on('data',d=>process.stdout.write('INPUT:'+d));setInterval(()=>{},1000);
}
