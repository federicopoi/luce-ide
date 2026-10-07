import {cp,lstat,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const assets=new Set(['completion.wav','Luce.icns','Luce.png','icon.svg','luce-logo.svg','luce-mark.svg','providers/codex.svg','providers/claude.svg','providers/README.md']);
const rootFiles=new Set(['package.json','LICENSE','LICENSE.md','NOTICE','NOTICE.md','THIRD_PARTY_NOTICES.md']);
const privateName=/^(?:auth(?:entication)?|credentials?|secrets?|tokens?|passwords?|workspace|open-workspace|accounts|identity|settings)(?:\.[^.]+)?$/i;
const developmentDirectories=new Set(['test','tests','docs','doc','examples','example','coverage','artifacts']);

export function payloadFilter(lock){
 if(lock?.lockfileVersion<2||!lock?.packages)throw Error('Packaging requires a current package-lock.json with package entries.');
 const modules=Object.entries(lock.packages).filter(([name,entry])=>name.startsWith('node_modules/')&&!entry.dev&&!entry.link).map(([name])=>name),production=new Set(modules);
 return relative=>{
  const name=relative.replaceAll('\\','/').replace(/^\/+|\/+$/g,'');if(!name)return true;
  const parts=name.split('/');if(parts.some(part=>part.startsWith('.')||part==='..'||(privateName.test(part)&&!/\.(?:[cm]?js|ts)$/.test(part))))return false;
  if(/\.(?:pem|key|p12|pfx|keychain(?:-db)?|sqlite3?|db)$/i.test(name))return false;
  if(parts[0]==='node_modules'){
   // Only the supported target's prebuilt PTY code belongs in a macOS arm64 app.
   if(name.startsWith('node_modules/node-pty/prebuilds/')&&!/^node_modules\/node-pty\/prebuilds\/darwin-arm64(?:\/|$)/.test(name))return false;
   if(parts.some(part=>developmentDirectories.has(part)))return false;
   if(modules.some(module=>module.startsWith(name+'/')))return true;
   const last=parts.lastIndexOf('node_modules'),length=last+1+(parts[last+1]?.startsWith('@')?2:1),module=parts.slice(0,length).join('/');
   return production.has(module);
  }
  if(parts.length===1&&rootFiles.has(name))return true;
  if(name==='src'||name==='src/main'||name==='src/shared')return true;
  if(name.startsWith('src/main/')||name.startsWith('src/shared/'))return /\.(?:cjs|mjs|js)$/.test(name);
  if(name==='dist')return true;
  if(name.startsWith('dist/'))return parts.slice(1).every(part=>!developmentDirectories.has(part))&&(!path.posix.extname(name)||/\.(?:js|css|html|png|svg|ico|webmanifest|wasm|woff2?|ttf)$/.test(name));
  if(name==='assets')return true;
  if(name.startsWith('assets/')){const asset=name.slice(7);return assets.has(asset)||[...assets].some(file=>file.startsWith(asset+'/'));}
  return false;
 };
}

export async function stageApplication(source,target){
 const lock=JSON.parse(await readFile(path.join(source,'package-lock.json'),'utf8')),allowed=payloadFilter(lock);
 await cp(source,target,{recursive:true,filter:async file=>{
  const relative=path.relative(source,file);if(relative==='package.json'||!allowed(relative))return false;
  // Never follow a repository symlink into a private file or an external tree.
  return !(await lstat(file)).isSymbolicLink();
 }});
 const original=JSON.parse(await readFile(path.join(source,'package.json'),'utf8')),metadata={};
 for(const key of ['name','productName','version','description','main','dependencies','optionalDependencies','license','author','homepage','repository'])if(original[key]!==undefined)metadata[key]=original[key];
 await writeFile(path.join(target,'package.json'),JSON.stringify(metadata,null,2)+'\n');
 return target;
}

export function distributionOptions(env={},args=[]){
 const modes=args.filter(arg=>['--local','--unsigned','--public'].includes(arg));
 for(const arg of args)if(!['--local','--unsigned','--public'].includes(arg))throw Error(`Unknown packaging option: ${arg}`);
 if(modes.length>1)throw Error('Choose one packaging mode: --local, --unsigned or --public.');
 const mode=(modes[0]||'--local').slice(2);if(mode!=='public')return {mode};
 if(!env.LUCE_SIGN_IDENTITY?.startsWith('Developer ID Application: '))throw Error('Public packaging requires LUCE_SIGN_IDENTITY naming an existing Developer ID Application identity.');
 if(!env.LUCE_NOTARY_PROFILE)throw Error('Public packaging requires explicit notarization credentials through LUCE_NOTARY_PROFILE (an existing notarytool keychain profile).');
 return {mode,osxSign:{identity:env.LUCE_SIGN_IDENTITY,hardenedRuntime:true},osxNotarize:{keychainProfile:env.LUCE_NOTARY_PROFILE,...(env.LUCE_NOTARY_KEYCHAIN?{keychain:env.LUCE_NOTARY_KEYCHAIN}:{})}};
}

export async function installedElectronVersion(source){
 const installed=JSON.parse(await readFile(path.join(source,'node_modules/electron/package.json'),'utf8'));
 if(typeof installed.version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(installed.version))throw Error('Installed Electron has no exact version; run npm ci before packaging.');
 const lock=JSON.parse(await readFile(path.join(source,'package-lock.json'),'utf8'));
 if(lock.packages?.['node_modules/electron']?.version!==installed.version)throw Error('Installed Electron version differs from package-lock.json; run npm ci before packaging.');
 return installed.version;
}
