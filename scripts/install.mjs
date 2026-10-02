import {cp,mkdir,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {constants} from 'node:fs';
const source=path.resolve('release/Orbit-darwin-arm64/Orbit.app'),applications=path.join(os.homedir(),'Applications'),target=path.join(applications,'Orbit.app');
await stat(source);await mkdir(applications,{recursive:true});
try{await stat(target);const backup=path.join(applications,`Orbit-backup-${Date.now()}.app`);await rename(target,backup);console.log(`Previous app preserved at ${backup}`);}catch(error){if(error.code!=='ENOENT')throw error;}
await cp(source,target,{recursive:true,verbatimSymlinks:true,mode:constants.COPYFILE_FICLONE});console.log(`Installed ${target}`);
