const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
test('local signing identity persists across builds without recreating keys',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'luce-signing-test-')),directory=path.join(root,'identity'),calls=[];
 const run=(file,args)=>{calls.push([file,args]);if(args[0]==='req')require('node:fs').writeFileSync(args[args.indexOf('-out')+1],'certificate');if(args[0]==='create-keychain')require('node:fs').writeFileSync(args.at(-1),'keychain');if(args[0]==='x509')return Buffer.from('stable certificate DER');return Buffer.from('');};
 try{const {ensureSigningIdentity}=await import('../scripts/signing.mjs');const a=await ensureSigningIdentity({directory,run}),password=await fs.readFile(path.join(directory,'password'),'utf8');const b=await ensureSigningIdentity({directory,run});assert.equal(a.fingerprint,b.fingerprint);assert.equal(a.keychain,b.keychain);assert.equal(await fs.readFile(path.join(directory,'password'),'utf8'),password);assert.equal(calls.filter(([,a])=>a[0]==='req').length,1);assert.equal(calls.filter(([,a])=>a[0]==='create-keychain').length,1);assert.equal((await fs.stat(path.join(directory,'password'))).mode&0o777,0o600);assert.equal((await fs.stat(directory)).mode&0o777,0o700);
 await fs.unlink(a.keychain);await assert.rejects(ensureSigningIdentity({directory,run}),/incomplete/);assert.equal(calls.filter(([,a])=>a[0]==='req').length,1,'Missing keychain cannot silently generate a new identity');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('existing incomplete signing material is never silently replaced',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'luce-signing-partial-'));try{await fs.writeFile(path.join(root,'password'),'keep me');const {ensureSigningIdentity}=await import('../scripts/signing.mjs');await assert.rejects(ensureSigningIdentity({directory:root,run:()=>{throw Error('should not run');}}),/incomplete/);assert.equal(await fs.readFile(path.join(root,'password'),'utf8'),'keep me');}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('signing restores the keychain search list on success and failure',async()=>{
 const {signBundle}=await import('../scripts/signing.mjs');
 for(const fail of [false,true]){
  const calls=[],run=(file,args)=>{calls.push([file,args]);if(args[0]==='list-keychains'&&!args.includes('-s'))return Buffer.from('    "/user/login.keychain-db"\n');if(fail&&file.endsWith('codesign'))throw Error('fixture failure');return Buffer.from('');};
  if(fail)assert.throws(()=>signBundle('/fixture.app',{fingerprint:'A'.repeat(40),keychain:'/private/luce.keychain-db'},{run}),/fixture failure/);else signBundle('/fixture.app',{fingerprint:'A'.repeat(40),keychain:'/private/luce.keychain-db'},{run});
  assert.deepEqual(calls.at(-1),['/usr/bin/security',['list-keychains','-d','user','-s','/user/login.keychain-db']]);assert.ok(calls.some(([,args])=>args.includes('/private/luce.keychain-db')));
 }
});
