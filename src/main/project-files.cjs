const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const {randomUUID}=require('node:crypto');const {Readable}=require('node:stream');
const TEXT_LIMIT=1024*1024;
const mediaTypes={'.png':['image','image/png'],'.jpg':['image','image/jpeg'],'.jpeg':['image','image/jpeg'],'.gif':['image','image/gif'],'.webp':['image','image/webp'],'.svg':['image','image/svg+xml'],'.avif':['image','image/avif'],'.bmp':['image','image/bmp'],'.ico':['image','image/x-icon'],'.mp4':['video','video/mp4'],'.m4v':['video','video/mp4'],'.mov':['video','video/quicktime'],'.webm':['video','video/webm'],'.ogv':['video','video/ogg'],'.mp3':['audio','audio/mpeg'],'.wav':['audio','audio/wav'],'.m4a':['audio','audio/mp4'],'.ogg':['audio','audio/ogg']};
const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
class ProjectFiles{
 constructor(){this.media=new Map();}
 async resolve(root,relative=''){
  if(typeof relative!=='string'||relative.length>4096||relative.includes('\0')||path.isAbsolute(relative))throw Error('Choose a file inside this project.');
  const base=await fsp.realpath(root),candidate=path.resolve(base,relative);
  if(!inside(base,candidate))throw Error('This path is outside the project.');
  const file=await fsp.realpath(candidate);if(!inside(base,file))throw Error('This link points outside the project.');return {base,file,path:candidate};
 }
 async locate(root,cwd,text){
  if(typeof text!=='string'||text.length>4096||/[\x00-\x1f\x7f]/.test(text))throw Error('Invalid file link.');
  const suffix=/:([0-9]+)(?::([0-9]+))?$/.exec(text),line=suffix?Number(suffix[1]):null;
  let name=suffix?text.slice(0,suffix.index):text;if(name.startsWith('~/'))name=path.join(require('node:os').homedir(),name.slice(2));
  const base=await fsp.realpath(root),absolute=path.resolve(await fsp.realpath(cwd),name),relative=path.relative(base,absolute);const resolved=await this.resolve(base,relative);
  if(!(await fsp.stat(resolved.file)).isFile())throw Error('This link is not a file.');return {relative,path:resolved.path,line};
 }
 async list(root,relative='',hidden=false){
  const resolved=await this.resolve(root,relative);const all=await fsp.readdir(resolved.file,{withFileTypes:true});
  const ordered=all.filter(e=>hidden||!e.name.startsWith('.')).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
  const entries=[];for(const entry of ordered.slice(0,3000)){let directory=entry.isDirectory(),blocked=false;const rel=path.join(relative,entry.name);if(entry.isSymbolicLink())try{const target=await this.resolve(root,rel);directory=(await fsp.stat(target.file)).isDirectory();}catch{blocked=true;}if(!directory&&!entry.isFile()&&!entry.isSymbolicLink())continue;entries.push({name:entry.name,relative:rel,path:path.join(resolved.path,entry.name),directory,symlink:entry.isSymbolicLink(),blocked});}
  entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));return {entries,truncated:ordered.length>3000};
 }
 async preview(root,relative){
  const resolved=await this.resolve(root,relative),stat=await fsp.stat(resolved.file);if(!stat.isFile())throw Error('Choose a regular file to preview.');
  const result={name:path.basename(relative),relative,path:resolved.path,size:stat.size},type=mediaTypes[path.extname(relative).toLowerCase()];
  if(type){const token=randomUUID();this.media.set(token,{root,relative,mime:type[1]});while(this.media.size>64)this.media.delete(this.media.keys().next().value);return {...result,kind:type[0],url:`luce-file://media/${token}`};}
  if(stat.size>TEXT_LIMIT)return {...result,kind:'large',message:'This file is too large for a text preview (1 MB maximum).'};
  // Bound the read even when a file grows between stat and open.
  const handle=await fsp.open(resolved.file,'r');let bytes;try{const buffer=Buffer.alloc(TEXT_LIMIT+1);const read=await handle.read(buffer,0,buffer.length,0);bytes=buffer.subarray(0,read.bytesRead);}finally{await handle.close();}
  if(bytes.length>TEXT_LIMIT)return {...result,kind:'large',message:'This file is too large for a text preview (1 MB maximum).'};
  if(bytes.includes(0))return {...result,kind:'unsupported',message:'A preview is not available for this binary file.'};
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return {...result,kind:'unsupported',message:'A preview is not available for this file encoding.'};}
  return {...result,kind:'text',text};
 }
 async mediaResponse(request){
  try{
   const url=new URL(request.url),token=url.pathname.slice(1),item=this.media.get(token);if(url.hostname!=='media'||!item||!['GET','HEAD'].includes(request.method))return new Response(null,{status:404});
   const {file}=await this.resolve(item.root,item.relative),handle=await fsp.open(file,'r'),stat=await handle.stat();if(!stat.isFile()){await handle.close();return new Response(null,{status:404});}
   const size=stat.size,headers={'Content-Type':item.mime,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};let start=0,end=size-1,status=200;
   const range=request.headers.get('range');if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2])){await handle.close();return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});}if(!match[1]){start=Math.max(0,size-Number(match[2]));}else{start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;}if(start>end||start<0||start>=size){await handle.close();return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});}status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
   headers['Content-Length']=String(Math.max(0,end-start+1));if(request.method==='HEAD'||size===0){await handle.close();return new Response(null,{status,headers});}
   return new Response(Readable.toWeb(handle.createReadStream({start,end,autoClose:true})),{status,headers});
  }catch{return new Response(null,{status:404});}
 }
}
module.exports={ProjectFiles};
