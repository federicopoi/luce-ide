const {app,BrowserWindow,ipcMain,dialog,Menu}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {Store}=require('./store.cjs');
const {discover}=require('./history.cjs');
const {TerminalManager}=require('./terminals.cjs');
const {resolveEnvironment}=require('./environment.cjs');
const {previewURL}=require('./validation.cjs');
const {Preview}=require('./preview.cjs');
app.setName('Orbit');
if(process.env.ORBIT_PROFILE){fs.mkdirSync(process.env.ORBIT_PROFILE,{recursive:true});app.setPath('userData',process.env.ORBIT_PROFILE);}
let window,store,terminals,environment,preview,quitting=false,history={sessions:[],projects:[]},historyLoading=false,discoveryPromise;
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{window?.show();window?.focus();});
function send(name,value){if(window&&!window.isDestroyed())window.webContents.send(`orbit:${name}`,value);}
function snapshot(){return {...store.snapshot(),terminals:terminals.list(),history:history.sessions,discoveredProjects:history.projects,historyLoading,providers:{codex:!!environment.executables.codex,claude:!!environment.executables.claude}};}
function changed(){send('state-changed',snapshot());}
async function refresh(){if(discoveryPromise)return discoveryPromise;historyLoading=true;changed();discoveryPromise=discover().then(result=>{history=result;}).catch(error=>{send('preview-event',{status:'notice',message:error.message});}).finally(()=>{historyLoading=false;discoveryPromise=null;changed();});return discoveryPromise;}
function project(id){if(typeof id!=='string')throw Error('Invalid project.');const p=store.snapshot().projects.find(p=>p.id===id);if(!p)throw Error('Project not found.');return p;}
function handle(name,fn){ipcMain.handle(`orbit:${name}`,async(event,...args)=>{if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('This request did not come from Orbit.');return fn(...args);});}
function registerIPC(){
 handle('state',()=>snapshot());
 handle('add-project',async directory=>{if(directory===undefined||directory===null){const result=await dialog.showOpenDialog(window,{title:'Add a project to Orbit',properties:['openDirectory','createDirectory'],buttonLabel:'Add project'});if(result.canceled)return null;directory=result.filePaths[0];}const p=store.addProject(directory);preview.hide();changed();return p;});
 handle('select-project',id=>{project(id);store.setSelected(id);preview.hide();changed();return snapshot();});
 handle('update-project',(id,patch)=>{project(id);if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Invalid project settings.');const allowed={};if(patch.name!==undefined)allowed.name=patch.name;if(patch.layout!==undefined)allowed.layout=patch.layout;if(patch.previewURL!==undefined)allowed.previewURL=patch.previewURL?previewURL(patch.previewURL):'';
  if(patch.conversationNames!==undefined){if(!patch.conversationNames||typeof patch.conversationNames!=='object'||Array.isArray(patch.conversationNames))throw Error('Invalid conversation names.');allowed.conversationNames={};for(const [key,value]of Object.entries(patch.conversationNames)){if(key.length>200||typeof value!=='string')throw Error('Invalid conversation name.');allowed.conversationNames[key]=value.trim().slice(0,100);}}
  const result=store.updateProject(id,allowed);changed();return result;});
 handle('remove-project',async id=>{const p=project(id);const active=terminals.list().filter(s=>s.projectId===id&&s.status==='running');const {response}=await dialog.showMessageBox(window,{type:'question',message:`Remove ${p.name} from Orbit?`,detail:active.length?`This stops ${active.length} running terminal(s). Project files and agent history are kept.`:'Project files and agent history are kept.',buttons:['Cancel','Remove project'],defaultId:0,cancelId:0});if(response!==1)return false;for(const s of terminals.list().filter(s=>s.projectId===id))terminals.forget(s.id);store.removeProject(id);preview.hide();changed();return true;});
 handle('history',async()=>{await refresh();return snapshot();});
 handle('create-terminal',options=>{if(!options||typeof options!=='object')throw Error('Invalid terminal options.');const p=project(options.projectId);if(options.title!==undefined&&(typeof options.title!=='string'||options.title.length>200))throw Error('Invalid terminal title.');return terminals.create(p,options);});
 handle('get-terminal',id=>terminals.get(id));handle('write-terminal',(id,data)=>terminals.write(id,data));handle('resize-terminal',(id,cols,rows)=>terminals.resize(id,cols,rows));
 handle('rename-terminal',(id,title)=>{const s=terminals.rename(id,title);if(s.conversationId){const p=project(s.projectId);store.updateProject(p.id,{conversationNames:{...p.conversationNames,[`${s.provider}:${s.conversationId}`]:s.title}});}changed();return s;});
 handle('close-terminal',async id=>{const s=terminals.get(id);if(s.status==='running'){const {response}=await dialog.showMessageBox(window,{type:'question',message:`Close ${s.title}?`,detail:'This stops the running terminal. Agent conversations can be resumed from history.',buttons:['Cancel','Close terminal'],defaultId:0,cancelId:0});if(response!==1)return false;}terminals.forget(id);refresh();return true;});
 handle('show-preview',async options=>{if(!options||typeof options!=='object')throw Error('Invalid preview request.');const id=options.projectId||store.snapshot().selectedProjectId;project(id);const url=previewURL(options.url);if(options.sessionId){const s=terminals.get(options.sessionId);if(s.projectId!==id)throw Error('Preview belongs to another project.');terminals.setPreview(s.id,url);}store.updateProject(id,{previewURL:url});changed();return preview.show({...options,projectId:id,url});});
 handle('hide-preview',()=>preview.hide());handle('preview-bounds',bounds=>preview.setBounds(bounds));handle('reload-preview',()=>preview.reload());
}
function createWindow(){
 window=new BrowserWindow({width:1480,height:940,minWidth:960,minHeight:640,backgroundColor:'#171819',title:'Orbit',titleBarStyle:'hidden',trafficLightPosition:{x:18,y:20},webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 preview=new Preview(window,event=>send('preview-event',event));window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
 window.webContents.on('did-start-loading',()=>preview.hide());
 window.on('close',event=>{if(!quitting){event.preventDefault();preview.hide();window.hide();}});
 window.on('show',()=>send('shortcut','window-shown'));window.on('closed',()=>{preview.destroy();window=null;});
 window.loadFile(path.join(__dirname,'../../dist/index.html'));
}
function menu(){const action=name=>()=>send('shortcut',name);Menu.setApplicationMenu(Menu.buildFromTemplate([
 {label:'Orbit',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'Quit Orbit',accelerator:'Cmd+Q',click:()=>app.quit()}]},
 {label:'File',submenu:[{label:'Add project…',accelerator:'Cmd+O',click:action('add-project')},{label:'New conversation',accelerator:'Cmd+N',click:action('new-conversation')},{label:'New shell',accelerator:'Cmd+T',click:action('new-shell')}]},
 {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
 {label:'View',submenu:[{label:'Toggle website preview',accelerator:'Cmd+Shift+P',click:action('toggle-preview')},{label:'Focus conversation search',accelerator:'Cmd+K',click:action('search')},{type:'separator'},...[1,2,4].map((n,i)=>({label:`${n} terminal${n===1?'':'s'}`,accelerator:`Cmd+${i+1}`,click:action(`layout-${n}`)})),{label:'Focus current terminal',accelerator:'Cmd+Shift+Enter',click:action('focus-terminal')},{type:'separator'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]},
 {role:'windowMenu'}
 ]));}
app.on('before-quit',event=>{
 if(quitting)return;const running=terminals?.list().filter(s=>s.status==='running').length||0;
 if(running&&!process.env.ORBIT_TEST){event.preventDefault();dialog.showMessageBox(window,{type:'question',message:'Quit Orbit?',detail:`This stops ${running} running terminal(s). Saved agent conversations remain available to resume.`,buttons:['Keep working','Quit Orbit'],defaultId:0,cancelId:0}).then(({response})=>{if(response===1){quitting=true;terminals.dispose();app.quit();}});return;}
 quitting=true;terminals?.dispose();
});
app.on('activate',()=>{if(window){window.show();window.focus();}else if(store)createWindow();});
app.whenReady().then(async()=>{store=new Store(path.join(app.getPath('userData'),'workspace.json'));environment=await resolveEnvironment();terminals=new TerminalManager(environment);terminals.on('data',event=>send('terminal-data',event));terminals.on('changed',changed);registerIPC();createWindow();menu();refresh();setInterval(refresh,20000).unref();}).catch(error=>{dialog.showErrorBox('Orbit could not start',error.stack||error.message);quitting=true;app.quit();});
