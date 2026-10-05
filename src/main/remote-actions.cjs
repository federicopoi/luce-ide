class RemoteActions {
 constructor(options){Object.assign(this,options);this.submittingTerminals=new Set();}
 terminal(id){if(typeof id!=='string'||id.length>128)throw Error('Invalid terminal.');try{return this.terminals.get(id);}catch{throw Error('Terminal not found.');}}
 state(){const s=this.snapshot();return {projects:s.projects.map(({id,name,directory,codexAccountId})=>({id,name,directory,codexAccountId})),terminals:s.terminals.map(t=>{const h=(s.history||[]).find(h=>h.id===t.conversationId&&h.provider===t.provider&&(t.provider!=='codex'||h.accountId===t.accountId));return {...t,...(Number.isFinite(h?.diskBytes)?{diskBytes:h.diskBytes}:{})};}),accounts:s.accounts,providers:s.providers,approvals:this.approvals.list(),remoteCapabilities:{submit:true,previewControls:true,sessionControls:true}};}
 async execute(method,params={},context={}){
  if(!params||typeof params!=='object'||Array.isArray(params))throw Error('Invalid request.');
  switch(method){
   case 'state':return this.state();
   case 'rename':this.terminal(params.id);if(typeof params.title!=='string'||!params.title.trim()||params.title.length>100)throw Error('Enter a conversation name of up to 100 characters.');if(!this.rename)throw Error('Unsupported remote operation.');return this.rename(params.id,params.title.trim());
   case 'autoApprove':{const s=this.terminal(params.id);if(s.status!=='running'||!s.approvalsCapable||!['codex','claude'].includes(s.provider)||typeof params.enabled!=='boolean')throw Error('Auto approval requires a running agent terminal.');this.approvals.setAutoApprove(params.id,params.enabled);return this.terminal(params.id);}
   case 'terminalSnapshot':{const s=this.terminal(params.id);return {buffer:s.buffer,outputOffset:s.outputOffset,cols:s.cols||90,rows:s.rows||24};}
   case 'write':this.terminal(params.id);if(typeof params.data!=='string'||params.data.length>64*1024)throw Error('Invalid terminal input.');this.terminals.write(params.id,params.data);return true;
   case 'submit':{
    if(typeof params.id!=='string'||typeof params.data!=='string'||!params.data||params.data.length>64*1024)throw Error('Invalid terminal input.');
    if(this.submittingTerminals.has(params.id))throw Error('A terminal submission is already in progress.');
    this.submittingTerminals.add(params.id);
    try{
     const session=this.terminal(params.id);if(session.status!=='running')throw Error('This terminal has exited. Start another terminal to continue.');
     this.terminals.write(params.id,params.data);
     await (this.submitDelay?this.submitDelay():new Promise(resolve=>setTimeout(resolve,250)));
     const current=this.terminal(params.id);if(current.status!=='running')throw Error('This terminal has exited. Start another terminal to continue.');
     this.terminals.write(params.id,'\r');return true;
    }finally{this.submittingTerminals.delete(params.id);}
   }
   case 'interrupt':this.terminal(params.id);this.terminals.write(params.id,'\x03');return true;
   case 'close':this.terminal(params.id);await this.terminals.forget(params.id);return true;
   case 'create':if(!['codex','claude','shell'].includes(params.provider)||typeof params.projectId!=='string')throw Error('Choose a project and terminal type.');return this.create({projectId:params.projectId,provider:params.provider,accountId:params.accountId,conversationId:params.conversationId});
   case 'approve':if(typeof params.requestId!=='string'||params.requestId.length>200||!['accept','decline'].includes(params.decision))throw Error('Invalid approval decision.');if(!await this.approvals.resolve(params.requestId,params.decision))throw Error('This request has already been resolved or expired.');return true;
   case 'preview':{
    this.terminal(params.id);
    if(params.mode!==undefined&&!['phone','desktop'].includes(params.mode))throw Error('Invalid preview mode.');
    if(params.width!==undefined&&!Number.isFinite(params.width)||params.height!==undefined&&!Number.isFinite(params.height))throw Error('Invalid preview viewport.');
    const options={};for(const key of ['mode','width','height'])if(params[key]!==undefined)options[key]=params[key];
    return this.preview.capture(params.id,options);
   }
   case 'previewInput':{
    this.terminal(params.id);
    if(params.mode!==undefined&&!['phone','desktop'].includes(params.mode)||params.width!==undefined&&!Number.isFinite(params.width)||params.height!==undefined&&!Number.isFinite(params.height))throw Error('Invalid preview viewport.');
    if(params.type==='click'||params.type==='scroll'){
     if(![params.x,params.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||params.type==='scroll'&&(!Number.isFinite(params.deltaY)||Math.abs(params.deltaY)>2000||params.deltaX!==undefined&&(!Number.isFinite(params.deltaX)||Math.abs(params.deltaX)>2000)))throw Error('Invalid preview coordinates.');
    }else if(params.type==='text'){
     if(typeof params.text!=='string'||!params.text.length||params.text.length>4096)throw Error('Invalid preview text input.');
    }else if(params.type==='key'){
     if(!['Enter','Tab','Backspace','Escape'].includes(params.key))throw Error('Unsupported preview key.');
    }else if(params.type==='navigate'){
     if(!['back','forward','reload'].includes(params.action))throw Error('Unsupported preview navigation.');
    }else throw Error('Unsupported preview input.');
    return this.preview.input(params);
   }
   case 'pushKey':return this.push.publicKey();
   case 'pushSubscribe':if(!context.deviceId)throw Error('Authenticated device required.');await this.push.subscribe(context.deviceId,params.subscription);return true;
   case 'pushUnsubscribe':if(!context.deviceId)throw Error('Authenticated device required.');await this.push.unsubscribe(context.deviceId);return true;
   default:throw Error('Unsupported remote operation.');
  }
 }
}
module.exports={RemoteActions};
