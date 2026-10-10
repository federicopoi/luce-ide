const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke(`luce:${name}`,...args);
function subscribe(name,callback){const listener=(_event,value)=>callback(value);ipcRenderer.on(`luce:${name}`,listener);return ()=>ipcRenderer.removeListener(`luce:${name}`,listener);}
contextBridge.exposeInMainWorld('luce',{
 checkCLIUpdates:()=>invoke('cli-update-check'),
 retryWorkspace:()=>invoke('retry-workspace'),dismissWorkspace:id=>invoke('dismiss-workspace',id),
 resolveProjectFile:(id,relative)=>invoke('resolve-project-file',id,relative),locateTerminalFile:(id,text)=>invoke('locate-terminal-file',id,text),
 listProjectFiles:(id,relative,hidden)=>invoke('project-files',id,relative,hidden),previewProjectFile:(id,relative)=>invoke('project-file-preview',id,relative),
 remoteStatus:()=>invoke('remote-status'),enableRemote:()=>invoke('remote-enable'),disableRemote:()=>invoke('remote-disable'),remoteAwake:enabled=>invoke('remote-awake',enabled),pairPhone:name=>invoke('remote-pair',name),revokePhone:id=>invoke('remote-revoke',id),approveRemote:(id,decision)=>invoke('remote-approve',id,decision),
 setCompletionSound:enabled=>invoke('sound-setting',enabled),previewSound:()=>invoke('preview-sound'),saveAttachment:(id,bytes)=>invoke('save-attachment',id,bytes),
 filePath:file=>webUtils.getPathForFile(file),
 setAutoApprove:(id,enabled)=>invoke('auto-approve',id,enabled),
 textContinuation:id=>invoke('text-continuation',id),
 linkConversation:(id,conversationId)=>invoke('link-conversation',id,conversationId),pasteContinuation:id=>invoke('paste-continuation',id),
 addAccount:name=>invoke('add-account',name),renameAccount:(id,name)=>invoke('rename-account',id,name),loginAccount:id=>invoke('login-account',id),cancelAccountLogin:id=>invoke('cancel-account-login',id),refreshAccounts:()=>invoke('refresh-accounts'),removeAccount:id=>invoke('remove-account',id),switchAccount:(id,targetId,options)=>invoke('switch-account',id,targetId,options),
 addGitHubAccount:name=>invoke('github-add',name),updateGitHubAccount:(id,patch)=>invoke('github-update',id,patch),loginGitHubAccount:id=>invoke('github-login',id),cancelGitHubLogin:id=>invoke('github-cancel',id),refreshGitHubAccounts:()=>invoke('github-refresh'),removeGitHubAccount:id=>invoke('github-remove',id),openGitHubLogin:id=>invoke('github-open',id),copyGitHubCode:id=>invoke('github-copy',id),
 getState:()=>invoke('state'),addProject:directory=>invoke('add-project',directory),assignConversation:(identity,projectId)=>invoke('assign-conversation',identity,projectId),createConversationProject:(identity,name)=>invoke('create-conversation-project',identity,name),renameConversation:(identity,title)=>invoke('rename-conversation',identity,title),selectProject:id=>invoke('select-project',id),updateProject:(id,patch)=>invoke('update-project',id,patch),removeProject:id=>invoke('remove-project',id),moveProject:(id,targetId,after)=>invoke('move-project',id,targetId,after),
 refreshHistory:()=>invoke('history'),createTerminal:options=>invoke('create-terminal',options),getTerminal:id=>invoke('get-terminal',id),writeTerminal:(id,data)=>invoke('write-terminal',id,data),resizeTerminal:(id,cols,rows)=>invoke('resize-terminal',id,cols,rows),renameTerminal:(id,title)=>invoke('rename-terminal',id,title),closeTerminal:id=>invoke('close-terminal',id),
 showPreview:options=>invoke('show-preview',options),hidePreview:()=>invoke('hide-preview'),previewBounds:bounds=>invoke('preview-bounds',bounds),reloadPreview:()=>invoke('reload-preview'),
 onState:callback=>subscribe('state-changed',callback),onData:callback=>subscribe('terminal-data',callback),onPreview:callback=>subscribe('preview-event',callback),onShortcut:callback=>subscribe('shortcut',callback)
});
