import {packager} from '@electron/packager';
import {execFileSync} from 'node:child_process';
import {access} from 'node:fs/promises';
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/prepare-native.mjs'],{stdio:'inherit'});
try{await access('assets/Orbit.icns');}catch{execFileSync(process.execPath,['scripts/icon.mjs'],{stdio:'inherit'});}
const outputs=await packager({dir:'.',name:'Orbit',platform:'darwin',arch:'arm64',out:'release',overwrite:true,icon:'assets/Orbit.icns',appBundleId:'com.fedepoi.orbit',appCategoryType:'public.app-category.developer-tools',appVersion:'0.1.0',buildVersion:'1',asar:{unpack:'**/node_modules/node-pty/**'},asarIntegrityDigest:false,prune:true,ignore:[/^\/tests(?:\/|$)/,/^\/scripts(?:\/|$)/,/^\/docs(?:\/|$)/,/^\/artifacts(?:\/|$)/,/^\/release(?:\/|$)/,/^\/\.git(?:\/|$)/,/^\/\.superpowers(?:\/|$)/,/^\/src\/renderer(?:\/|$)/,/^\/assets\/Orbit\.iconset(?:\/|$)/],extendInfo:{NSHighResolutionCapable:true,NSHumanReadableCopyright:'Orbit — Personal development workspace'}});
for(const output of outputs){execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',`${output}/Orbit.app`],{stdio:'inherit'});console.log(`Packaged ${output}/Orbit.app`);}
