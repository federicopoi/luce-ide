import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import electron from 'electron';

// A dedicated profile allows the design branch to run beside the installed app.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=path.join(root,'artifacts','orca-preview-profile');
await mkdir(profile,{recursive:true});
const require=createRequire(import.meta.url);
const {Store}=require('../src/main/store.cjs');
const store=new Store(path.join(profile,'workspace.json'));
if(!store.snapshot().projects.length){const project=store.addProject(root);store.updateProject(project.id,{name:'Luce · Orca Preview',layout:2});}
const env={...process.env,LUCE_PROFILE:profile,ORBIT_PROFILE:profile,LUCE_DESIGN_PREVIEW:'1'};
delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,[root],{cwd:root,env,stdio:'inherit'});
child.on('error',error=>{console.error('Could not open Luce Preview:',error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
console.log('Luce Preview uses its own profile: '+profile);
