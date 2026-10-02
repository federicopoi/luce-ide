const {EventEmitter}=require('node:events');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const pty=require('node-pty');
const {launchSpec,detectLocalURL}=require('./validation.cjs');
const {stopTree}=require('./processes.cjs');
class TerminalManager extends EventEmitter {
 constructor({env,executables={},shell='/bin/zsh'}){super();this.env=env;this.executables=executables;this.shell=shell;this.sessions=new Map();}
 metadata(s){return {id:s.id,projectId:s.projectId,provider:s.provider,conversationId:s.conversationId,title:s.title,status:s.status,previewURL:s.previewURL,previewAvailable:!!s.previewAvailable,createdAt:s.createdAt,exitCode:s.exitCode};}
 list(){return [...this.sessions.values()].map(s=>this.metadata(s));}
 get(id){const s=this.sessions.get(id);if(!s)throw Error('Terminal not found.');return {...this.metadata(s),buffer:s.buffer,outputOffset:s.outputOffset};}
 create(project,{provider='shell',conversationId=null,title,cols=90,rows=24}={}){
  if(!['shell','codex','claude'].includes(provider))throw Error('Unknown terminal type.');
  if(conversationId){const existing=[...this.sessions.values()].find(s=>s.projectId===project.id&&s.provider===provider&&s.conversationId===conversationId&&s.status==='running');if(existing)return this.metadata(existing);}
  try{if(!fs.statSync(project.directory).isDirectory())throw Error();}catch{throw Error('This project folder is missing. Choose an existing folder.');}
  const newSession=provider==='claude'&&!conversationId;if(newSession)conversationId=randomUUID();
  const spec=provider==='shell'?{file:this.shell,args:['-l']}:launchSpec(provider,conversationId,this.executables,{newSession});
  const child=pty.spawn(spec.file,spec.args,{cwd:project.directory,env:this.env,name:'xterm-256color',cols:Math.max(2,Math.min(500,Number(cols)||90)),rows:Math.max(2,Math.min(300,Number(rows)||24))});
  const s={id:randomUUID(),projectId:project.id,provider,conversationId,title:title||({shell:'Project shell',codex:'Codex conversation',claude:'Claude conversation'}[provider]),status:'running',previewURL:'',previewAvailable:false,createdAt:new Date().toISOString(),buffer:'',outputOffset:0,scanTail:'',child};
  this.sessions.set(s.id,s);
  child.onData(data=>{s.buffer=(s.buffer+data).slice(-1024*1024);s.outputOffset+=data.length;s.scanTail=(s.scanTail+data).slice(-4096);const url=detectLocalURL(s.scanTail);if(url&&url!==s.previewURL){s.detectedURL=url;s.previewURL=url;this.emit('changed',this.list());}this.emit('data',{id:s.id,data,offset:s.outputOffset});});
  child.onExit(({exitCode})=>{s.status='exited';s.exitCode=exitCode;this.emit('changed',this.list());});this.emit('changed',this.list());return this.metadata(s);
 }
 write(id,data){const s=this.sessions.get(id);if(!s||s.status!=='running')throw Error('This terminal has exited. Start another terminal to continue.');if(typeof data!=='string'||data.length>1024*1024)throw Error('Invalid terminal input.');s.child.write(data);}
 resize(id,cols,rows){if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||rows<2||cols>500||rows>300)throw Error('Invalid terminal size.');const s=this.sessions.get(id);if(s?.status==='running')s.child.resize(cols,rows);}
 rename(id,title){const s=this.sessions.get(id);if(!s)throw Error('Terminal not found.');if(typeof title!=='string'||!title.trim())throw Error('Enter a conversation name.');s.title=title.trim().slice(0,100);this.emit('changed',this.list());return this.metadata(s);}
 setPreview(id,url){const s=this.sessions.get(id);if(!s)throw Error('Terminal not found.');s.previewURL=url;this.emit('changed',this.list());}
 updatePreviewAvailability(id,url){const s=this.sessions.get(id);if(!s)return;const available=!!url&&s.status==='running';if(s.previewAvailable===available&&(!available||s.previewURL===url))return;s.previewAvailable=available;if(available)s.previewURL=url;this.emit('changed',this.list());}
 async close(id){const s=this.sessions.get(id);if(!s||s.status==='exited')return;if(s.stopPromise)return s.stopPromise;s.status='stopping';this.emit('changed',this.list());s.stopPromise=stopTree(s.child.pid).then(async()=>{for(let i=0;i<20&&s.status!=='exited';i++)await new Promise(resolve=>setTimeout(resolve,25));if(s.status!=='exited')throw Error('Waiting for terminal exit confirmation.');}).catch(error=>{s.stopPromise=null;throw error;});return s.stopPromise;}
 async forget(id){await this.close(id);this.sessions.delete(id);this.emit('changed',this.list());}
 async dispose(){await Promise.all([...this.sessions.keys()].map(id=>this.close(id)));}
}
module.exports={TerminalManager};
