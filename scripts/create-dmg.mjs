/** Create the explicitly unnotarized Apple Silicon beta installer. */
import {execFileSync} from 'node:child_process';
import {access,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';

if(process.platform!=='darwin')throw Error('DMG creation requires macOS.');
if(process.argv.length>3)throw Error('Usage: node scripts/create-dmg.mjs [path/to/Luce.app]');
const app=path.resolve(process.argv[2]||'release/Luce-darwin-arm64/Luce.app');
const run=(tool,args)=>execFileSync(tool,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const plist=path.join(app,'Contents/Info.plist');
const version=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',plist]);
if(!/^\d+\.\d+\.\d+-beta\.\d+$/.test(version))throw Error('This script only creates an explicitly versioned beta DMG.');
if(run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',plist])!=='com.fedepoi.luce')throw Error('Expected the Luce application bundle.');
if(run('/usr/bin/lipo',['-archs',path.join(app,'Contents/MacOS/Luce')])!=='arm64')throw Error('Expected an Apple Silicon-only app.');
run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
const output=path.resolve(`release/Luce-${version}-mac-arm64.dmg`);
try{await access(output);throw Error(`Refusing to overwrite ${output}`);}catch(error){if(error.code!=='ENOENT')throw error;}
const staging=await mkdtemp(path.join(os.tmpdir(),'luce-dmg-'));
try{
 const stagedApp=path.join(staging,'Luce.app');
 execFileSync('/usr/bin/ditto',[app,stagedApp]);
 await symlink('/Applications',path.join(staging,'Applications'));
 await writeFile(path.join(staging,'Install Luce.txt'),`Luce ${version} — Apple Silicon beta\n\nRequires an Apple Silicon Mac (M1 or later) running macOS 13+.\n\n1. Drag Luce.app into Applications. Eject this disk image after copying.\n2. Open Luce from Applications. If macOS blocks it, dismiss the warning without moving it to Trash.\n3. Open System Settings > Privacy & Security, scroll to Security, and choose Open Anyway for Luce. Authenticate if asked, then confirm Open.\n\nThis beta has a local integrity signature. It is not Developer ID signed or notarized by Apple. Only approve the Luce copy downloaded from the official release.\nVisual installation help: https://federicopoi.github.io/luce/#install-guide\nApple instructions: https://support.apple.com/en-us/102445\n\nCodex and Claude Code are separate tools: install and sign in to your own CLI to use those agents. Phone access requires your own relay setup.\n\nLicense and production dependency notices are included in Luce.app/Contents/Resources/app.asar.\n`);
 run('/usr/bin/codesign',['--verify','--deep','--strict',stagedApp]);
 execFileSync('/usr/bin/hdiutil',['create','-volname',`Luce ${version}`,'-srcfolder',staging,'-fs','HFS+','-format','UDZO',output],{stdio:'inherit'});
 execFileSync('/usr/bin/hdiutil',['verify',output],{stdio:'inherit'});
 const checksum=createHash('sha256').update(await readFile(output)).digest('hex');
 await writeFile(output+'.sha256',`${checksum}  ${path.basename(output)}\n`);
 console.log(`Created ${output}\nSHA-256: ${checksum}\nUnnotarized Apple Silicon beta; first launch requires Open Anyway.`);
}finally{await rm(staging,{recursive:true,force:true});}
