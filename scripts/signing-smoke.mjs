import {ensureSigningIdentity,signBundle} from './signing.mjs';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';
const root=await mkdtemp(path.join(os.tmpdir(),'luce-signing-check-'));
try{
 const identity=await ensureSigningIdentity(),again=await ensureSigningIdentity();assert.deepEqual(again,identity,'Builds reuse the same keychain and certificate');const results=[];
 for(const version of ['1','2']){
  const bundle=path.join(root,`Luce-${version}.app`),contents=path.join(bundle,'Contents');await mkdir(path.join(contents,'MacOS'),{recursive:true});await mkdir(path.join(contents,'Resources'));await cp('/bin/echo',path.join(contents,'MacOS/Luce'));
  await writeFile(path.join(contents,'Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.fedepoi.luce.signing-check</string><key>CFBundleExecutable</key><string>Luce</string><key>CFBundleVersion</key><string>${version}</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);await writeFile(path.join(contents,'Resources/design.txt'),`Different app design version ${version}`);signBundle(bundle,identity);
  const result=spawnSync('/usr/bin/codesign',['-d','-r-','--verbose=4',bundle],{encoding:'utf8'});assert.equal(result.status,0);const text=result.stdout+result.stderr;results.push({bundle,requirement:text.match(/designated => ([^\n]+)/)?.[1],hash:text.match(/^CDHash=(.+)$/m)?.[1]});
 }
 assert.ok(results[0].requirement&&!results[0].requirement.includes('cdhash'),'Identity is anchored to a certificate, not build bytes');assert.match(results[0].requirement,/certificate leaf = H"/);assert.equal(results[0].requirement,results[1].requirement,'Different builds have the same privacy identity');assert.notEqual(results[0].hash,results[1].hash,'Fixture actually changes the signed build');
 for(const row of results)execFileSync('/usr/bin/codesign',['--verify','--deep','--strict','-R','='+results[0].requirement,row.bundle]);
 console.log('PASS: two different signed builds share a certificate-bound designated requirement and verify against each other');
}finally{await rm(root,{recursive:true,force:true});}
