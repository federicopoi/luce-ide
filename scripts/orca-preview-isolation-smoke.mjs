import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root=await mkdtemp(path.join(os.tmpdir(),'luce-orca-isolation-'));
let normal,preview;
try {
 const launch=(name,design)=>electron.launch({args:[path.resolve('.')],env:{...process.env,LUCE_TEST:'1',LUCE_DESIGN_PREVIEW:design,LUCE_PROFILE:path.join(root,name),LUCE_HISTORY_HOME:path.join(root,name,'history')}});
 normal=await launch('normal','0');
 const original=await normal.firstWindow();
 await original.waitForFunction(async()=>window.luce&&!(await window.luce.getState()).workspaceRestoring);
 preview=await launch('preview','1');
 const redesigned=await preview.firstWindow();
 await redesigned.waitForFunction(async()=>window.luce&&!(await window.luce.getState()).workspaceRestoring);
 assert.equal(await normal.evaluate(({app})=>app.getName()),'Luce');
 assert.equal(await preview.evaluate(({app})=>app.getName()),'Luce Preview');
 assert.notEqual(await normal.evaluate(({app})=>app.getPath('userData')),await preview.evaluate(({app})=>app.getPath('userData')));
 assert.equal(await preview.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle()),'Luce Preview · Orca Design');
 const folder=path.join(root,'Original project');await mkdir(folder);
 const project=await original.evaluate(dir=>window.luce.addProject(dir),folder);
 const session=await original.evaluate(id=>window.luce.createTerminal({projectId:id,provider:'shell'}),project.id);
 assert.equal((await redesigned.evaluate(()=>window.luce.getState())).projects.length,0,'Preview never imports the other instance workspace');
 await redesigned.reload();
 await redesigned.getByText('Open a project',{exact:true}).waitFor();
 assert.equal(await preview.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle()),'Luce Preview · Orca Design','Preview branding survives reload');
 await preview.close();preview=null;
 assert.equal((await original.evaluate(id=>window.luce.getTerminal(id),session.id)).status,'running','Closing preview preserves the original terminal');
 console.log('PASS: two simultaneous app instances, distinct profiles/names, independent projects, preview title after reload, and retained original PTY');
} finally {
 if(preview)await preview.close();
 if(normal)await normal.close();
 await rm(root,{recursive:true,force:true});
}
