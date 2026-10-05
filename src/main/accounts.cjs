const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {randomUUID}=require('node:crypto');
class Accounts {
 constructor({directory,env={}}){this.directory=directory;this.env=env;this.file=path.join(directory,'accounts.json');this.entries=[{id:'default',name:'Work',home:env.CODEX_HOME?path.resolve(env.CODEX_HOME):path.join(os.homedir(),'.codex'),managed:false}];try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(Array.isArray(saved))for(const a of saved){if(a.id==='default'){this.entries[0].name=this.name(a.name);continue;}if(/^[a-f0-9-]{36}$/.test(a.id))this.entries.push({id:a.id,name:this.name(a.name),home:path.join(directory,'codex-accounts',a.id),managed:true});}}catch{} }
 name(value){if(typeof value!=='string'||!value.trim())throw Error('Enter an account name.');return value.trim().slice(0,60);}
 save(){fs.mkdirSync(this.directory,{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.entries.map(({id,name})=>({id,name})),null,2),{mode:0o600});fs.renameSync(temp,this.file);}
 get(id='default'){const entry=this.entries.find(a=>a.id===id);if(!entry)throw Error('Codex account not found.');return entry;}
 list(){return this.entries.map(({id,name,managed})=>({id,name,managed}));}
 add(name){const id=randomUUID(),entry={id,name:this.name(name),home:path.join(this.directory,'codex-accounts',id),managed:true};fs.mkdirSync(entry.home,{recursive:true,mode:0o700});fs.writeFileSync(path.join(entry.home,'config.toml'),'cli_auth_credentials_store = "file"\n',{mode:0o600});this.entries.push(entry);this.save();return {id,name:entry.name,managed:true};}
 rename(id,name){this.get(id).name=this.name(name);this.save();return this.list();}
 remove(id){if(id==='default')throw Error('The existing account cannot be removed.');this.get(id);this.entries=this.entries.filter(a=>a.id!==id);this.save();/* Keep credentials/history on disk: removal never deletes conversations. */}
 environment(id='default'){const a=this.get(id),env={...this.env,CODEX_HOME:a.home};if(a.managed){for(const key of ['OPENAI_API_KEY','OPENAI_ACCESS_TOKEN','CODEX_API_KEY','OPENAI_BASE_URL','CHATGPT_BASE_URL'])delete env[key];}return env;}
 args(id='default'){return this.get(id).managed?['-c','cli_auth_credentials_store="file"']:[];}
}
module.exports={Accounts};
