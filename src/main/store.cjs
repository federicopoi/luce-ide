const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
class Store {
 constructor(file){
  this.file=file;this.state={version:1,projects:[],selectedProjectId:null};
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(saved.projects))throw Error('Invalid workspace');this.state={...this.state,...saved};}
  catch(error){if(error.code!=='ENOENT'&&fs.existsSync(file))fs.renameSync(file,`${file}.corrupt-${Date.now()}`);}
 }
 snapshot(){return structuredClone(this.state);}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=`${this.file}.tmp`;fs.writeFileSync(temp,JSON.stringify(this.state,null,2),{mode:0o600});fs.renameSync(temp,this.file);}
 addProject(directory){
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Choose an absolute project directory.');
  let canonical;try{canonical=fs.realpathSync(directory);if(!fs.statSync(canonical).isDirectory())throw Error();}catch{throw Error('Project folder does not exist or is not a directory.');}
  const existing=this.state.projects.find(p=>p.directory===canonical);if(existing)return structuredClone(existing);
  const project={id:randomUUID(),name:path.basename(canonical)||canonical,directory:canonical,layout:4,previewURL:'',conversationNames:{}};this.state.projects.push(project);this.state.selectedProjectId=project.id;this.save();return structuredClone(project);
 }
 updateProject(id,patch){
  const project=this.state.projects.find(p=>p.id===id);if(!project)throw Error('Project not found.');
  if(patch.layout!==undefined&&![1,2,4].includes(patch.layout))throw Error('Choose a one, two or four terminal layout.');
  if(patch.name!==undefined){if(typeof patch.name!=='string'||!patch.name.trim())throw Error('Enter a project name.');project.name=patch.name.trim().slice(0,80);}
  for(const key of ['layout','previewURL','conversationNames'])if(patch[key]!==undefined)project[key]=patch[key];
  this.save();return structuredClone(project);
 }
 removeProject(id){this.state.projects=this.state.projects.filter(p=>p.id!==id);if(this.state.selectedProjectId===id)this.state.selectedProjectId=this.state.projects[0]?.id||null;this.save();}
 setSelected(id){if(!this.state.projects.some(p=>p.id===id))throw Error('Project not found.');this.state.selectedProjectId=id;this.save();}
}
module.exports={Store};
