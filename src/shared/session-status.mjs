export function sessionStatus(session,approvals=[]){
 if(session.status!=='running')return {key:'exited',label:session.status==='stopping'?'Stopping':'Exited'};
 if(approvals.some(a=>a.terminalId===session.id&&(a.state||a.status||'pending')==='pending'))return {key:'attention',label:'Needs approval'};
 if(session.working)return {key:'working',label:'Working'};
 if(session.activity==='attention'||session.completionPending&&session.completionReason==='attention')return {key:'attention',label:'Needs input'};
 if(session.activity==='waiting')return {key:'waiting',label:'Waiting'};
 if(session.activity==='complete'||session.completionPending)return {key:'finished',label:'Finished'};
 return {key:'ready',label:session.provider==='shell'?'Shell':'Ready'};
}
export function projectActivity(id,sessions,approvals=[]){const counts={open:0,working:0,attention:0,finished:0};for(const s of sessions.filter(s=>s.projectId===id&&s.status==='running')){counts.open++;const {key}=sessionStatus(s,approvals);if(key in counts)counts[key]++;}return counts;}
