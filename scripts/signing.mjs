import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir,access,chmod,unlink} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';

function runTool(file,args){
 try{return execFileSync(file,args,{stdio:['ignore','pipe','pipe']});}
 catch(error){
  // execFileSync's default error includes arguments, which may contain keychain passwords.
  let detail=String(error.stderr||'').trim();
  for(let i=0;i<args.length-1;i++)if(['-p','-P','-k'].includes(args[i]))detail=detail.split(args[i+1]).join('[redacted]');
  throw Error(`${path.basename(file)} failed during local signing (exit ${error.status??'unknown'}). ${detail.slice(0,1000)}`);
 }
}
export async function ensureSigningIdentity({directory=path.join(os.homedir(),'Library/Application Support/Luce Signing'),run=runTool}={}){
 const keychain=path.join(directory,'identity.keychain-db'),certificate=path.join(directory,'certificate.pem'),passwordFile=path.join(directory,'password'),metadata=path.join(directory,'identity.json');
 await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
 const fingerprint=()=>createHash('sha1').update(run('/usr/bin/openssl',['x509','-in',certificate,'-outform','DER'])).digest('hex').toUpperCase();
 if((await readdir(directory)).length){
  let saved,password;
  try{saved=JSON.parse(await readFile(metadata,'utf8'));password=await readFile(passwordFile,'utf8');await access(keychain);await access(certificate);}catch{throw Error('Local signing identity is incomplete. Restore its existing files; a replacement would reset app permissions.');}
  if(saved.version!==1||!/^[A-F0-9]{40}$/.test(saved.fingerprint)||!/^[a-f0-9]{64}$/.test(password)||fingerprint()!==saved.fingerprint)throw Error('Local signing identity is incomplete or does not match its certificate.');
  await chmod(passwordFile,0o600);run('/usr/bin/security',['unlock-keychain','-p',password,keychain]);return {fingerprint:saved.fingerprint,keychain};
 }
 const password=randomBytes(32).toString('hex'),key=path.join(directory,'private-key.pem'),archive=path.join(directory,'identity.p12'),config=path.join(directory,'openssl.cnf');
 await writeFile(passwordFile,password,{mode:0o600});
 await writeFile(config,'[req]\ndistinguished_name=subject\nx509_extensions=signing\nprompt=no\n[subject]\nCN=Luce Local Signing\n[signing]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\n',{mode:0o600});
 run('/usr/bin/openssl',['req','-new','-x509','-sha256','-newkey','rsa:3072','-nodes','-keyout',key,'-out',certificate,'-days','3650','-config',config]);
 run('/usr/bin/openssl',['pkcs12','-export','-in',certificate,'-inkey',key,'-out',archive,'-name','Luce Local Signing','-passout',`file:${passwordFile}`]);
 const searchList=String(run('/usr/bin/security',['list-keychains','-d','user'])),previous=[...searchList.matchAll(/"([^"\n]+)"/g)].map(match=>match[1]);
 try{run('/usr/bin/security',['create-keychain','-p',password,keychain]);}
 finally{if(previous.length)run('/usr/bin/security',['list-keychains','-d','user','-s',...previous]);}
 run('/usr/bin/security',['set-keychain-settings','-u','-t','3600',keychain]);
 run('/usr/bin/security',['unlock-keychain','-p',password,keychain]);
 run('/usr/bin/security',['import',archive,'-k',keychain,'-P',password,'-T','/usr/bin/codesign']);
 run('/usr/bin/security',['set-key-partition-list','-S','apple-tool:,apple:,codesign:','-s','-k',password,keychain]);
 const value=fingerprint();await writeFile(metadata,JSON.stringify({version:1,fingerprint:value}),{mode:0o600});await chmod(keychain,0o600);
 for(const file of [key,archive,config])await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
 return {fingerprint:value,keychain};
}
export function signBundle(bundle,identity,{run=runTool}={}){
 // macOS identity lookup still needs a custom keychain in its search list,
 // even when codesign receives --keychain. Preserve the user's normal list.
 const previous=[...String(run('/usr/bin/security',['list-keychains','-d','user'])).matchAll(/"([^"\n]+)"/g)].map(match=>match[1]),added=!previous.includes(identity.keychain);
 try{
  if(added)run('/usr/bin/security',['list-keychains','-d','user','-s',...previous,identity.keychain]);
  run('/usr/bin/codesign',['--force','--deep','--sign',identity.fingerprint,'--keychain',identity.keychain,'--timestamp=none',bundle]);
  run('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
 }finally{if(added)run('/usr/bin/security',['list-keychains','-d','user','-s',...previous]);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const identity=await ensureSigningIdentity();console.log('Persistent local Luce signing identity is ready.');
 if(process.argv[2]){signBundle(path.resolve(process.argv[2]),identity);console.log('Signed and verified the app with its persistent identity.');}
}
