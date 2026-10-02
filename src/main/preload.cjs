const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke(`luce:${name}`,...args);
function subscribe(name,callback){const listener=(_event,value)=>callback(value);ipcRenderer.on(`luce:${name}`,listener);return ()=>ipcRenderer.removeListener(`luce:${name}`,listener);}
contextBridge.exposeInMainWorld('luce',{
 getState:()=>invoke('state'),addProject:directory=>invoke('add-project',directory),selectProject:id=>invoke('select-project',id),updateProject:(id,patch)=>invoke('update-project',id,patch),removeProject:id=>invoke('remove-project',id),
 refreshHistory:()=>invoke('history'),createTerminal:options=>invoke('create-terminal',options),getTerminal:id=>invoke('get-terminal',id),writeTerminal:(id,data)=>invoke('write-terminal',id,data),resizeTerminal:(id,cols,rows)=>invoke('resize-terminal',id,cols,rows),renameTerminal:(id,title)=>invoke('rename-terminal',id,title),closeTerminal:id=>invoke('close-terminal',id),
 showPreview:options=>invoke('show-preview',options),hidePreview:()=>invoke('hide-preview'),previewBounds:bounds=>invoke('preview-bounds',bounds),reloadPreview:()=>invoke('reload-preview'),
 onState:callback=>subscribe('state-changed',callback),onData:callback=>subscribe('terminal-data',callback),onPreview:callback=>subscribe('preview-event',callback),onShortcut:callback=>subscribe('shortcut',callback)
});
