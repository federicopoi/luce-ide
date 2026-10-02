import {readdir,readlink,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const bundle=path.resolve(process.argv[2]||path.join(os.homedir(),'Applications/Orbit.app'));
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink()){const link=await readlink(file);assert.ok(!path.isAbsolute(link),`Installed bundle contains an absolute symlink: ${file}`);assert.ok((await realpath(file)).startsWith(bundle+path.sep),`Installed symlink points outside the bundle: ${file}`);}else if(entry.isDirectory())await walk(file);}}
await walk(bundle);execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit'});console.log('PASS: installed app is independently linked and its complete signature verifies');
