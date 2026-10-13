const fs=require('node:fs');

function recordProjectError(file,error){
 // Keep a small local diagnostic file; never record request arguments or contents.
 try{const previous=fs.existsSync(file)?fs.readFileSync(file,'utf8').slice(-24000):'';
  const message=String(error?.message||error||'Unknown error').replace(/[\r\n]/g,' ').slice(0,1000);
  fs.writeFileSync(file,previous+JSON.stringify({time:new Date().toISOString(),operation:'add-project',message})+'\n',{mode:0o600});
 }catch{ /* A logging failure must not prevent recovery. */ }
}

function createProjectPicker(showDialog){
 let pending=null;
 return ()=>{
  if(pending)return pending;
  pending=Promise.resolve().then(showDialog).then(result=>{
   if(result?.canceled===true)return null;
   const directory=result?.filePaths?.[0];
   if(typeof directory!=='string'||!directory)throw Error('The folder picker did not return a folder.');
   return directory;
  }).finally(()=>{pending=null;});
  return pending;
 };
}
module.exports={createProjectPicker,recordProjectError};
