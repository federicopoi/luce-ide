import {readFile,readdir,lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
async function safeFile(file){const stat=await lstat(file);if(stat.isSymbolicLink())throw Error(`Refusing a symlink in dependency notices: ${file}`);if(!stat.isFile()||stat.size>1024*1024)throw Error(`Invalid dependency notice file: ${file}`);return readFile(file,'utf8');}
function licenseText(text){return text.replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').trim();}
export async function generateNotices(root=process.cwd()){
 const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
 const sections=['# Third-party notices\n\nGenerated from the production dependencies in package-lock.json. Each dependency retains its own license. Its unmodified source is distributed in the app’s node_modules directory.\n\nElectron includes its own LICENSE and LICENSES.chromium.html in packaged releases. OpenAI/Codex and Anthropic/Claude provider marks are third-party trademarks; they are not relicensed under Luce’s MIT license. See assets/providers/README.md for their sources. Luce is an independent project and is not endorsed by those providers.'];
 for(const [relative,entry] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
  if(!relative||entry.dev)continue;
  if(!relative.startsWith('node_modules/')||relative.split('/').includes('..'))throw Error('Invalid production dependency path.');
  const directory=path.join(root,relative);if(entry.optional){try{await lstat(directory);}catch(error){if(error.code==='ENOENT')continue;throw error;}}let current=root;
  for(const part of relative.split('/')){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error(`Refusing a symlink in dependency notices: ${relative}`);}
  const metadata=JSON.parse(await safeFile(path.join(directory,'package.json'))),files=(await readdir(directory)).filter(name=>/^(licen[cs]e|copying|notice)([._-].*)?$/i.test(name)).sort();
  const repository=typeof metadata.repository==='string'?metadata.repository:metadata.repository?.url;
  const texts=[];for(const file of files)texts.push(`### ${file}\n\n${licenseText(await safeFile(path.join(directory,file)))}`);
  if(!files.length&&metadata.name==='http_ece'&&metadata.version==='1.2.0'){
   const source='https://github.com/web-push-libs/encrypted-content-encoding/blob/0562510a30819f52424724a6fd5504becacd98a1/LICENSE';
   texts.push(`### LICENSE\n\nThe npm archive omits its license file. Retrieved from its published gitHead: ${source}\n\n${licenseText(await safeFile(path.join(root,'docs/third-party/http_ece-1.2.0-LICENSE')))}`);
  }
  if(!texts.length&&metadata.name.startsWith('@napi-rs/canvas-')){const parent=JSON.parse(await safeFile(path.join(root,'node_modules/@napi-rs/canvas/package.json')));if(parent.version===metadata.version)texts.push(`### LICENSE\n\nPlatform binary license from @napi-rs/canvas at the same version.\n\n${licenseText(await safeFile(path.join(root,'node_modules/@napi-rs/canvas/LICENSE')))}`);}
  if(!texts.length&&metadata.name==='isarray'&&metadata.version==='1.0.0'){const readme=await safeFile(path.join(directory,'README.md'));texts.push(`### License from README.md\n\n${licenseText(readme.slice(readme.indexOf('## License')))}`);}
  if(!texts.length)throw Error(`Missing license text for ${relative}.`);
  sections.push(`## ${metadata.name}@${metadata.version}\n\nLicense: ${entry.license||metadata.license||'See license text below.'}${repository?`\n\nUpstream: ${repository}`:''}\n\n${texts.join('\n\n')}`);
 }
 sections.push(`## Phosphor Icons 2.1.1 — bundled interface SVGs\n\nUpstream: https://github.com/phosphor-icons/core\n\n${licenseText(await safeFile(path.join(root,'assets/icons/LICENSE')))}`);
 return sections.join('\n\n---\n\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=await generateNotices();const file=path.resolve('THIRD_PARTY_NOTICES.md');
 if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==output)throw Error('Third-party notices are stale. Run npm run notices.');console.log('Third-party notices match production dependencies.');}
 else{await writeFile(file,output);console.log('Generated THIRD_PARTY_NOTICES.md.');}
}
