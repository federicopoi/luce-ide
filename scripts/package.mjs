import {packager} from '@electron/packager';
import {execFileSync} from 'node:child_process';
import {access,mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {ensureSigningIdentity,signBundle} from './signing.mjs';
import {stageApplication,distributionOptions,installedElectronVersion} from './packaging-config.mjs';
const {mode,...publicSigning}=distributionOptions(process.env,process.argv.slice(2));
const metadata=JSON.parse(await readFile('package.json','utf8'));
const electronVersion=await installedElectronVersion(path.resolve('.'));
if(mode!=='unsigned'&&process.platform!=='darwin')throw Error('Signing requires macOS. Use --unsigned to prepare an Apple Silicon build on CI.');
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/prepare-native.mjs'],{stdio:'inherit'});
try{await access('assets/Luce.icns');}catch{execFileSync(process.execPath,['scripts/icon.mjs'],{stdio:'inherit'});}
const temporary=await mkdtemp(path.join(os.tmpdir(),'luce-package-'));
try{
 const stage=await stageApplication(path.resolve('.'),path.join(temporary,'app'));
 const outputs=await packager({dir:stage,electronVersion,name:'Luce',platform:'darwin',arch:'arm64',out:path.resolve('release'),overwrite:true,icon:path.resolve('assets/Luce.icns'),appBundleId:'com.fedepoi.luce',appCategoryType:'public.app-category.developer-tools',appVersion:metadata.version,buildVersion:metadata.version,asar:{unpack:'**/node_modules/node-pty/**'},asarIntegrityDigest:false,prune:false,...publicSigning,extendInfo:{NSHighResolutionCapable:true,NSHumanReadableCopyright:'Copyright 2026 Luce contributors'}});
 if(mode==='local'){
  const identity=await ensureSigningIdentity();
  for(const output of outputs){signBundle(`${output}/Luce.app`,identity);console.log(`Packaged ${output}/Luce.app with persistent local signing`);}
 }else for(const output of outputs)console.log(`Packaged ${output}/Luce.app (${mode==='public'?'Developer ID signed and notarized':'unsigned development artifact; not notarized'})`);
}finally{await rm(temporary,{recursive:true,force:true});}
