const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {conversationKey}=require('./conversation-identity.cjs');
class Store {
 constructor(file){
  this.file=file;this.state={version:2,projects:[],selectedProjectId:null,conversations:{}};
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(saved.projects))throw Error('Invalid workspace');this.state={...this.state,...saved};}
  catch(error){if(error.code!=='ENOENT'&&fs.existsSync(file))fs.renameSync(file,`${file}.corrupt-${Date.now()}`);}
  if(!this.state.conversations||typeof this.state.conversations!=='object'||Array.isArray(this.state.conversations))this.state.conversations={};
 }
 snapshot(){return structuredClone(this.state);}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=`${this.file}.tmp`;fs.writeFileSync(temp,JSON.stringify(this.state,null,2),{mode:0o600});fs.renameSync(temp,this.file);}
 addProject(directory){
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Choose an absolute project directory.');
  let canonical;try{canonical=fs.realpathSync(directory);if(!fs.statSync(canonical).isDirectory())throw Error();}catch{throw Error('Project folder does not exist or is not a directory.');}
  const existing=this.state.projects.find(p=>p.directory===canonical&&!p.conversationGroup);if(existing)return structuredClone(existing);
  const project={id:randomUUID(),name:path.basename(canonical)||canonical,directory:canonical,layout:4,previewURL:'',conversationNames:{}};this.state.projects.push(project);this.state.selectedProjectId=project.id;this.save();return structuredClone(project);
 }
 createNamedProjectForConversation(identity,directory,name){
  const key=conversationKey(identity),canonical=this.canonicalDirectory(directory);
  if(typeof name!=='string'||!name.trim())throw Error('Enter a project name.');
  const project={id:randomUUID(),name:name.trim().slice(0,80),directory:canonical,conversationGroup:true,layout:4,previewURL:'',conversationNames:{}};
  this.state.projects.push(project);this.state.selectedProjectId=project.id;
  const legacyTitle=this.conversationTitle(identity);this.state.conversations[key]={...(this.state.conversations[key]||{}),...(legacyTitle?{title:legacyTitle}:{}),projectId:project.id,directory:canonical};this.save();return structuredClone(project);
 }
 canonicalDirectory(directory){
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Choose an absolute project directory.');
  try{const canonical=fs.realpathSync(directory);if(!fs.statSync(canonical).isDirectory())throw Error();return canonical;}catch{throw Error('Project folder does not exist or is not a directory.');}
 }
 conversation(identity){const value=this.state.conversations[conversationKey(identity)];return value?structuredClone(value):null;}
 conversationTitle(identity){const key=conversationKey(identity),known=this.state.conversations[key]?.title;if(known)return known;const legacyKey=key,unscopedKey=`${identity.provider}:${identity.id}`,allowUnscoped=identity.provider!=='codex'||(identity.accountId||'default')==='default';for(const p of this.state.projects){const value=p.conversationNames?.[legacyKey]||(allowUnscoped?p.conversationNames?.[unscopedKey]:null);if(typeof value==='string'&&value.trim())return value.trim();}return null;}
 setConversationTitle(identity,title){
  const key=conversationKey(identity);if(typeof title!=='string'||!title.trim())throw Error('Enter a conversation name.');
  this.state.conversations[key]={...(this.state.conversations[key]||{}),title:title.trim().slice(0,100)};this.save();return structuredClone(this.state.conversations[key]);
 }
 assignConversation(identity,projectId,{directory}={}){
  const key=conversationKey(identity),target=this.state.projects.find(p=>p.id===projectId);if(!target)throw Error('Project not found.');
  const canonical=this.canonicalDirectory(directory),legacyTitle=this.conversationTitle(identity);this.state.conversations[key]={...(this.state.conversations[key]||{}),...(legacyTitle?{title:legacyTitle}:{}),projectId,directory:canonical};
  this.save();return structuredClone(this.state.conversations[key]);
 }
 updateProject(id,patch){
  const project=this.state.projects.find(p=>p.id===id);if(!project)throw Error('Project not found.');
  if(patch.layout!==undefined&&![1,2,4].includes(patch.layout))throw Error('Choose a one, two or four terminal layout.');
  if(patch.name!==undefined){if(typeof patch.name!=='string'||!patch.name.trim())throw Error('Enter a project name.');project.name=patch.name.trim().slice(0,80);}
  for(const key of ['layout','previewURL','conversationNames','codexAccountId','githubAccountId'])if(patch[key]!==undefined)project[key]=patch[key];
  this.save();return structuredClone(project);
 }
 moveProject(id,targetId,after=false){
  if(typeof id!=='string'||typeof targetId!=='string'||typeof after!=='boolean')throw Error('Invalid project order.');
  const source=this.state.projects.find(p=>p.id===id),target=this.state.projects.find(p=>p.id===targetId);if(!source||!target)throw Error('Project not found.');
  if(id===targetId)return;
  const projects=this.state.projects.filter(p=>p.id!==id),index=projects.findIndex(p=>p.id===targetId);
  projects.splice(index+(after?1:0),0,source);this.state.projects=projects;this.save();
 }
 removeProject(id){this.state.projects=this.state.projects.filter(p=>p.id!==id);for(const record of Object.values(this.state.conversations))if(record.projectId===id)record.projectId=null;if(this.state.selectedProjectId===id)this.state.selectedProjectId=this.state.projects[0]?.id||null;this.save();}
 setSelected(id){if(!this.state.projects.some(p=>p.id===id))throw Error('Project not found.');this.state.selectedProjectId=id;this.save();}
}
module.exports={Store};
