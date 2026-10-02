import {chmod,readdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('node_modules/node-pty');
for(const folder of ['prebuilds/darwin-arm64','prebuilds/darwin-x64','build/Release']){
 try{if((await readdir(path.join(root,folder))).includes('spawn-helper'))await chmod(path.join(root,folder,'spawn-helper'),0o755);}catch(error){if(error.code!=='ENOENT')throw error;}
}
