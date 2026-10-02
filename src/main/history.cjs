const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile),cache=new Map();
async function walk(root,depth=5){let entries;try{entries=await fs.readdir(root,{withFileTypes:true});}catch{return [];}
 const result=[];for(const entry of entries){if(entry.isDirectory()&&depth>0&&entry.name!=='subagents')result.push(...await walk(path.join(root,entry.name),depth-1));else if(entry.isFile()&&entry.name.endsWith('.jsonl'))result.push(path.join(root,entry.name));}return result;}
async function records(file){
 const stat=await fs.stat(file);const previous=cache.get(file);if(previous?.mtime===stat.mtimeMs)return previous.records;
 const handle=await fs.open(file,'r');let text='';try{
  const size=Math.min(stat.size,256*1024),head=Buffer.alloc(size);await handle.read(head,0,size,0);text=head.toString('utf8');
  if(stat.size>size){text=text.slice(0,text.lastIndexOf('\n'));const length=Math.min(64*1024,stat.size-size),tail=Buffer.alloc(length);await handle.read(tail,0,length,stat.size-length);const end=tail.toString('utf8');text+='\n'+end.slice(end.indexOf('\n')+1);}
 }finally{await handle.close();}
 const parsed=[];for(const line of text.split('\n'))try{const value=JSON.parse(line);if(value&&typeof value==='object'&&!Array.isArray(value))parsed.push(value);}catch{}
 cache.set(file,{mtime:stat.mtimeMs,records:parsed});if(cache.size>1500)cache.delete(cache.keys().next().value);return parsed;
}
function promptText(content){if(typeof content==='string')return content;if(Array.isArray(content))return content.filter(c=>c&&typeof c==='object'&&(c.type==='text'||c.type==='input_text')&&typeof c.text==='string').map(c=>c.text).join(' ');return '';}
function title(text,fallback){return (typeof text==='string'?text:fallback).replace(/\s+/g,' ').trim().slice(0,100)||fallback;}
function humanPrompt(text){return text&&!/^\s*(<environment_context>|<system|<developer|# (AGENTS|Instructions)|This session is being continued)/i.test(text);}
async function databaseSessions(root){
 let files;try{files=(await fs.readdir(root)).filter(n=>/^state_\d+\.sqlite$/.test(n)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]));}catch{return [];}
 for(const file of files)try{
  const db=path.join(root,file);const schema=JSON.parse((await execute('/usr/bin/sqlite3',['-readonly','-json',db,'pragma table_info(threads)'],{timeout:3000})).stdout||'[]');const cols=new Set(schema.map(c=>c.name));if(!cols.has('cwd'))continue;
  const name=cols.has('name')?"NULLIF(name, ''),":'';const hasUser=cols.has('has_user_event')?'AND has_user_event = 1':'';const archived=cols.has('archived')?'AND archived = 0':'';
  const query=`SELECT id, cwd, COALESCE(${name}NULLIF(title,''), first_user_message, 'Codex conversation') AS title, updated_at, source FROM threads WHERE cwd IS NOT NULL ${hasUser} ${archived} ORDER BY updated_at DESC LIMIT 5000`;
  const {stdout}=await execute('/usr/bin/sqlite3',['-readonly','-json',db,query],{timeout:5000,maxBuffer:16*1024*1024});
  return JSON.parse(stdout||'[]').filter(r=>!String(r.source).includes('subagent')).map(r=>({id:r.id,provider:'codex',directory:r.cwd,title:title(r.title,'Codex conversation'),updatedAt:new Date(Number(r.updated_at)*1000).toISOString()}));
 }catch{}return [];
}
async function discover({home=os.homedir()}={}){
 const sessions=new Map(),codexRoot=path.join(home,'.codex'),claudeRoot=path.join(home,'.claude','projects');
 for(const session of await databaseSessions(codexRoot))sessions.set(`codex:${session.id}`,session);
 const names=new Map();try{for(const record of await records(path.join(codexRoot,'session_index.jsonl')))if(record.id)names.set(record.id,record);}catch{}
 const [codexFiles,claudeFiles]=await Promise.all([walk(path.join(codexRoot,'sessions')),walk(claudeRoot,1)]);
 // Read a handful concurrently to avoid saturating the disk on large histories.
 const files=[...codexFiles.map(file=>({file,provider:'codex'})),...claudeFiles.map(file=>({file,provider:'claude'}))];
 for(let start=0;start<files.length;start+=12)await Promise.all(files.slice(start,start+12).map(async({file,provider})=>{try{
  const rows=await records(file);let id,directory,first='',custom='',updatedAt='';
  if(provider==='codex'){
   const meta=rows.find(r=>r.type==='session_meta')?.payload;if(!meta||String(JSON.stringify(meta.source)).includes('subagent'))return;
   id=meta.id||meta.session_id;directory=meta.cwd;updatedAt=meta.timestamp;
   for(const row of rows){if(row.timestamp)updatedAt=row.timestamp;if(!first&&row.type==='response_item'&&row.payload?.role==='user'){const text=promptText(row.payload.content);if(humanPrompt(text))first=text;}}
   custom=names.get(id)?.thread_name||'';updatedAt=names.get(id)?.updated_at||updatedAt;
  }else{
   const meta=rows.find(r=>r.cwd&&r.sessionId&&!r.isSidechain);if(!meta)return;id=meta.sessionId;directory=meta.cwd;
   for(const row of rows){if(row.timestamp)updatedAt=row.timestamp;if(row.type==='custom-title')custom=row.customTitle||'';if(!first&&row.type==='user'&&!row.isSidechain&&!row.toolUseResult){const text=promptText(row.message?.content);if(humanPrompt(text))first=text;}}
  }
  if(!id||!directory||!path.isAbsolute(directory))return;
  try{directory=await fs.realpath(directory);}catch{directory=path.normalize(directory);}
  const key=`${provider}:${id}`,existing=sessions.get(key);if(existing){if(custom)existing.title=title(custom,existing.title);return;}
  sessions.set(key,{id,provider,directory,title:title(custom||first,`${provider==='codex'?'Codex':'Claude'} conversation`),updatedAt:updatedAt||new Date((await fs.stat(file)).mtimeMs).toISOString()});
 }catch{}}));
 const sorted=[...sessions.values()].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));const projects=[...new Set(sorted.map(s=>s.directory))].map(directory=>({directory,name:path.basename(directory),count:sorted.filter(s=>s.directory===directory).length}));
 return {sessions:sorted,projects};
}
module.exports={discover};
