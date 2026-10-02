import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const api=window.orbit,$=id=>document.getElementById(id);
const paths={orbit:'<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-40 12 12)"/><ellipse cx="12" cy="12" rx="6" ry="9" transform="rotate(-40 12 12)"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',folder:'<path d="M3 6h6l2 2h10v12H3Z"/>',shell:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>',codex:'<rect x="4" y="3" width="16" height="18" rx="4"/><circle cx="12" cy="12" r="4"/><path d="m10 7 4 10"/>',claude:'<path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5M8 3l8 18M3 8l18 8M3 16l18-8M8 21l8-18"/>',history:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',reload:'<path d="M20 9a8 8 0 1 0 0 6M20 3v6h-6"/>',expand:'<path d="M14 3h7v7m0-7-7 7M10 21H3v-7m0 7 7-7"/>',restore:'<path d="M21 3l-7 7m0-7v7h7M3 21l7-7m-7 0h7v7"/>',layout:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18M3 12h18"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m4 12 5 5L20 6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.shell}</svg>`;
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={projects:[],terminals:[],history:[],discoveredProjects:[],providers:{}},mode='terminal',expanded=false,focused=false,query='',activeId=null,previewSessionId=null,currentURL='',toastTimer,historyLimit=60;
const slots=new Map(),views=new Map(),activeProjects=new Map();
const project=()=>state.projects.find(p=>p.id===state.selectedProjectId);
const projectSessions=()=>state.terminals.filter(s=>s.projectId===state.selectedProjectId);
const providerName=provider=>({claude:'Claude',codex:'Codex',shell:'Terminal'}[provider]||provider);
const providerBadge=provider=>`<span class="provider-tag ${provider}">${icon(provider)}<span>${providerName(provider)}</span></span>`;
function toast(message,error=false){$('toast').textContent=message;$('toast').className=`toast${error?' error':''}`;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
async function run(action){try{return await action();}catch(error){toast(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,''),true);return null;}}
function relativeTime(date){const age=Math.max(0,(Date.now()-Date.parse(date))/1000);if(!Number.isFinite(age))return '';if(age<60)return 'Just now';if(age<3600)return `${Math.floor(age/60)}m ago`;if(age<86400)return `${Math.floor(age/3600)}h ago`;if(age<172800)return 'Yesterday';if(age<604800)return new Date(date).toLocaleDateString(undefined,{weekday:'short'});return new Date(date).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function titleFor(history){return project()?.conversationNames?.[`${history.provider}:${history.id}`]||history.title;}
function setActive(id){activeId=id;if(project())activeProjects.set(project().id,id);document.querySelectorAll('.terminal-pane,.session-row').forEach(el=>el.classList.toggle('active',el.dataset.sessionId===id));}
function popup(button,items){
 const box=$('popup');if(!button.getClientRects().length)button=$('layout-button');box.replaceChildren();for(const item of items){if(item.divider){const div=document.createElement('div');div.className='divider';box.append(div);continue;}const row=document.createElement('button');row.disabled=!!item.disabled;row.innerHTML=`${icon(item.icon||'shell')}<span>${escape(item.label)}</span>${item.hint?`<small>${escape(item.hint)}</small>`:''}`;row.onclick=()=>{box.hidden=true;run(item.action);};box.append(row);}
 const rect=button.getBoundingClientRect();box.style.left=`${Math.min(rect.left,innerWidth-230)}px`;box.style.top=`${Math.min(rect.bottom+5,innerHeight-items.length*42-10)}px`;box.hidden=false;
}
document.addEventListener('pointerdown',event=>{if(!$('popup').contains(event.target))$('popup').hidden=true;});
function newMenu(anchor=$('new-conversation')){if(!project()){addProject();return;}popup(anchor,[{label:'Codex conversation',icon:'codex',hint:state.providers.codex?'':'Not installed',disabled:!state.providers.codex,action:()=>createTerminal('codex')},{label:'Claude Code conversation',icon:'claude',hint:state.providers.claude?'':'Not installed',disabled:!state.providers.claude,action:()=>createTerminal('claude')},{divider:true},{label:'Project shell',icon:'shell',hint:'⌘ T',action:()=>createTerminal('shell')}]);}
async function createTerminal(provider,history=null){
 const p=project();if(!p)return;const session=await run(()=>api.createTerminal({projectId:p.id,provider,conversationId:history?.id||null,title:history?titleFor(history):undefined}));if(!session)return;
 activeId=session.id;activeProjects.set(p.id,session.id);focused=false;if(mode!=='terminal'){await api.hidePreview();mode='terminal';expanded=false;}
 state=await api.getState();let list=slots.get(p.id)||[];if(!list.includes(session.id)){if(list.length>=p.layout)list=list.slice(0,p.layout-1);list.push(session.id);}slots.set(p.id,list);render();views.get(session.id)?.terminal.focus();
}
async function addProject(directory){const p=await run(()=>api.addProject(directory));if(p){mode='terminal';expanded=false;activeId=null;state=await api.getState();render();}}
async function selectProject(id){if(id===state.selectedProjectId)return;await run(()=>api.selectProject(id));mode='terminal';expanded=false;focused=false;activeId=activeProjects.get(id)||null;state=await api.getState();render();}
function renderProjects(){
 $('projects').replaceChildren();for(const p of state.projects){const button=document.createElement('button');button.className=`project-item${p.id===state.selectedProjectId?' selected':''}`;button.dataset.projectId=p.id;button.title=`${p.name}\n${p.directory}`;button.innerHTML=`<span class="project-initial">${icon('folder')}</span><span class="project-name">${escape(p.name)}</span>`;button.onclick=()=>run(()=>selectProject(p.id));button.oncontextmenu=event=>{event.preventDefault();if(p.id===state.selectedProjectId)projectMenu(button);else run(async()=>{await selectProject(p.id);projectMenu(button);});};$('projects').append(button);}
}
function renderConversations(){
 const p=project();$('sidebar-title').textContent=p?.name||'Orbit';$('project-heading').textContent=p?.name||'Your workspace';$('project-path').textContent=p?.directory?.replace(/^\/Users\/[^/]+/,'~')||'A place for your coding sessions';$('project-path').title=p?.directory||'';$('project-menu').disabled=!p;$('new-conversation').disabled=!p;
 $('provider-status').textContent=[state.providers.claude?'Claude Code':'Claude not found',state.providers.codex?'Codex':'Codex not found'].join(' + ');$('refresh-indicator').classList.toggle('loading',!!state.historyLoading);
 const container=$('conversation-lists');container.replaceChildren();if(!p){container.innerHTML='<div class="empty-list">Add a project folder to see its terminals and saved conversations.</div>';return;}
 const live=projectSessions().filter(s=>s.title.toLowerCase().includes(query)),header=document.createElement('div');header.className='section-label';header.innerHTML=`OPEN TERMINALS<span class="count">${live.filter(s=>s.status==='running').length}</span>`;container.append(header);
 if(!live.length){const empty=document.createElement('div');empty.className='empty-list';empty.textContent=query?'No matching live terminals.':'Start a conversation or open a shell.';container.append(empty);}
 for(const s of live){const row=document.createElement('button');row.className=`session-row${s.id===activeId?' selected':''}`;row.dataset.sessionId=s.id;row.title=`${s.title} · ${s.status}`;row.innerHTML=`<span class="session-text">${escape(s.title)}</span>${providerBadge(s.provider)}`;row.onclick=()=>focusSession(s.id);row.oncontextmenu=e=>{e.preventDefault();sessionMenu(row,s);};container.append(row);}
 const history=state.history.filter(h=>h.directory===p.directory&&`${titleFor(h)} ${h.provider}`.toLowerCase().includes(query));
 const section=document.createElement('div');section.className='history-section';section.innerHTML=`<div class="section-label">CONVERSATIONS<span class="count">${history.length}</span></div>`;
 for(const h of history.slice(0,historyLimit)){const row=document.createElement('button');row.className='session-row history-row';row.title=`Resume ${providerName(h.provider)} · ${titleFor(h)}`;row.innerHTML=`<span class="history-title">${escape(titleFor(h))}</span><span class="history-provider">${providerName(h.provider)}</span><time>${escape(relativeTime(h.updatedAt))}</time>`;row.onclick=()=>run(()=>createTerminal(h.provider,h));row.oncontextmenu=e=>{e.preventDefault();popup(row,[{label:'Resume conversation',icon:h.provider,action:()=>createTerminal(h.provider,h)},{label:'Rename in Orbit',icon:'history',action:()=>renameHistory(h)}]);};section.append(row);}
 if(!history.length){const empty=document.createElement('div');empty.className='empty-list';empty.innerHTML=state.historyLoading?'Looking for saved conversations…':(query?'No matching conversations.':'No saved conversations in this folder yet.<br><button>Refresh history</button>');empty.querySelector('button')?.addEventListener('click',()=>run(()=>api.refreshHistory()));section.append(empty);}
 if(history.length>historyLimit){const more=document.createElement('button');more.className='welcome-secondary';more.textContent=`Show more (${history.length-historyLimit} remaining)`;more.onclick=()=>{historyLimit+=60;renderConversations();};section.append(more);}container.append(section);
}
function sessionMenu(anchor,s){popup(anchor,[{label:'Focus terminal',icon:'layout',action:()=>{focusSession(s.id);focused=!focused;renderWorkspace();}},{label:'Rename conversation',icon:'history',action:()=>renameTerminal(s)},{label:'Preview website',icon:'globe',action:()=>openPreview(s)},{divider:true},{label:'Close terminal',icon:'close',action:()=>api.closeTerminal(s.id)}]);}
async function renameTerminal(s){const name=await nameDialog('Rename conversation',s.title);if(name)await run(()=>api.renameTerminal(s.id,name));}
async function renameHistory(h){const name=await nameDialog('Rename conversation',titleFor(h));if(name){const p=project();await run(()=>api.updateProject(p.id,{conversationNames:{...p.conversationNames,[`${h.provider}:${h.id}`]:name}}));}}
function projectMenu(anchor=$('project-menu')){const p=project();if(!p)return;popup(anchor,[{label:'Rename project',icon:'folder',action:async()=>{const name=await nameDialog('Rename project',p.name);if(name)await api.updateProject(p.id,{name});}},{label:'Find saved conversations',icon:'history',action:()=>api.refreshHistory()},{divider:true},{label:'Remove from Orbit',icon:'close',action:()=>api.removeProject(p.id)}]);}
async function openModal(title,content,submitLabel='Save'){
 await api.hidePreview();$('modal-title').textContent=title;$('modal-content').replaceChildren(content);$('modal-submit').textContent=submitLabel;$('modal-submit').hidden=!submitLabel;$('modal-cancel').hidden=!submitLabel;$('modal').showModal();
}
async function nameDialog(title,initial){
 const content=document.createElement('div');content.innerHTML='<label for="modal-input">Name</label><input id="modal-input" maxlength="100" required>';await openModal(title,content);$('modal-input').value=initial;$('modal-input').focus();$('modal-input').select();
 return new Promise(resolve=>{const finish=value=>{$('modal').close();$('modal-form').onsubmit=null;$('modal').onclose=null;resolve(value);if(mode==='preview'&&currentURL)showBrowser();};$('modal-form').onsubmit=e=>{e.preventDefault();const value=$('modal-input').value.trim();if(value)finish(value);};$('modal').onclose=()=>finish(null);});
}
function closeModal(){$('modal').close();if(mode==='preview'&&currentURL)showBrowser();}
async function discoverProjects(){
 await run(()=>api.refreshHistory());state=await api.getState();const content=document.createElement('div');content.innerHTML='<p>Choose a project from your local Claude Code and Codex histories.</p><div class="search-field"><input id="discovery-search" placeholder="Search project folders" aria-label="Search project folders"></div><div class="discover-list"></div>';
 const list=content.querySelector('.discover-list');function fill(filter=''){list.replaceChildren();const items=state.discoveredProjects.filter(p=>`${p.name} ${p.directory}`.toLowerCase().includes(filter));for(const p of items){const row=document.createElement('button');row.type='button';row.className='discover-item';row.innerHTML=`<span class="project-initial">${icon('folder')}</span><div><strong>${escape(p.name)}</strong><small>${escape(p.directory.replace(/^\/Users\/[^/]+/,'~'))}</small><span class="muted">${p.count} conversation${p.count===1?'':'s'}</span></div>`;row.onclick=async()=>{await addProject(p.directory);closeModal();};list.append(row);}if(!items.length)list.innerHTML='<p class="empty-list">No matching project folders found.</p>';}
 fill();await openModal('Find local projects',content,'');content.querySelector('input').oninput=e=>fill(e.target.value.toLowerCase());content.querySelector('input').focus();
}
$('modal-close').onclick=closeModal;$('modal-cancel').onclick=closeModal;
function makeTerminal(s){
 const pane=document.createElement('section');pane.className='terminal-pane';pane.dataset.sessionId=s.id;pane.innerHTML='<div class="pane-header"></div><div class="terminal-body"></div>';
 const terminal=new Terminal({fontFamily:'"SFMono-Regular", Menlo, Monaco, monospace',fontSize:14,lineHeight:1.3,letterSpacing:0.15,cursorBlink:true,cursorStyle:'block',minimumContrastRatio:8,scrollback:10000,allowProposedApi:false,theme:{background:'#282a2c',foreground:'#ececec',cursor:'#ececec',cursorAccent:'#282a2c',selectionBackground:'#35495e',black:'#202426',red:'#dca08b',green:'#a3d6a9',yellow:'#d9c89c',blue:'#8cbaca',magenta:'#b6a9d1',cyan:'#8ec6c1',white:'#dce4e3',brightBlack:'#a8b0bb',brightRed:'#e7ad98',brightGreen:'#b4e4bb',brightYellow:'#ead8ad',brightBlue:'#a0cede',brightMagenta:'#cfc0e8',brightCyan:'#a4d9d3',brightWhite:'#f2f6f4'}});
 const fit=new FitAddon();terminal.loadAddon(fit);terminal.open(pane.querySelector('.terminal-body'));
 const view={pane,terminal,fit,ready:false,pending:[],lastCols:0,lastRows:0};views.set(s.id,view);
 terminal.onData(data=>run(()=>api.writeTerminal(s.id,data)));terminal.onTitleChange(()=>{});
 terminal.attachCustomKeyEventHandler(e=>{if(e.metaKey&&['k','n','t','o'].includes(e.key.toLowerCase()))return false;if(e.metaKey&&e.shiftKey&&e.key.toLowerCase()==='p')return false;return true;});
 pane.addEventListener('pointerdown',()=>{activeId=s.id;activeProjects.set(s.projectId,s.id);document.querySelectorAll('.terminal-pane').forEach(el=>el.classList.toggle('active',el.dataset.sessionId===s.id));renderConversations();});
 api.getTerminal(s.id).then(snapshot=>{terminal.write(snapshot.buffer);view.ready=true;for(const event of view.pending)if(event.offset>snapshot.outputOffset)terminal.write(event.data);view.pending=[];}).catch(error=>toast(error.message,true));
 return view;
}
function paneHeader(view,s){
 const header=view.pane.querySelector('.pane-header');header.innerHTML=`<span class="pane-title" title="${escape(s.title)}">${escape(s.title)}</span>${providerBadge(s.provider)}${s.previewAvailable?`<button class="pane-preview" aria-label="Preview website" title="Preview ${escape(s.previewURL)}">${icon('globe')}</button>`:''}<button class="icon-button pane-menu" aria-label="Terminal options" title="Terminal options">⋯</button>`;
 header.querySelector('.pane-preview')?.addEventListener('click',()=>run(()=>openPreview(s)));header.querySelector('.pane-menu').onclick=e=>sessionMenu(e.currentTarget,s);view.pane.classList.toggle('active',s.id===activeId);
}
function fitTerminals(){
 if(mode!=='terminal')return;for(const [id,view]of views){if(!view.pane.isConnected||view.pane.getBoundingClientRect().width<20)continue;try{view.fit.fit();const cols=Math.max(2,view.terminal.cols),rows=Math.max(2,view.terminal.rows);if(cols!==view.lastCols||rows!==view.lastRows){view.lastCols=cols;view.lastRows=rows;api.resizeTerminal(id,cols,rows).catch(()=>{});}}catch{}}
}
function renderWorkspace(){
 const p=project(),workspace=$('terminal-workspace');if(!p){workspace.className='terminal-workspace';workspace.innerHTML=`<div class="welcome"><div class="welcome-mark">${icon('orbit')}</div><div class="eyebrow">A LITTLE SPACE TO BUILD</div><h2>Open a project</h2><p>Choose a folder to start a terminal or resume a saved conversation.</p><button class="primary" id="welcome-add">＋ Add a project folder</button><button class="welcome-secondary" id="welcome-discover">Find projects from previous conversations ↗</button><div class="welcome-shortcuts"><span><kbd>⌘ O</kbd> Add project</span><span><kbd>⌘ N</kbd> New conversation</span><span><kbd>⌘ ⇧ P</kbd> Preview</span></div></div>`;$('welcome-add').onclick=()=>run(()=>addProject());$('welcome-discover').onclick=()=>run(discoverProjects);return;}
 const sessions=projectSessions();if(!activeId||!sessions.some(s=>s.id===activeId))activeId=sessions[0]?.id||null;
 let ids=(slots.get(p.id)||[]).filter(id=>sessions.some(s=>s.id===id)).slice(0,p.layout);for(const s of sessions)if(ids.length<p.layout&&!ids.includes(s.id))ids.push(s.id);slots.set(p.id,ids);
 if(focused&&activeId)ids=[activeId];workspace.className=`terminal-workspace layout-${p.layout}${focused?' focused':''}`;
 const panes=[];for(let i=0;i<(focused&&activeId?1:p.layout);i++){
  const s=sessions.find(s=>s.id===ids[i]);if(s){const view=views.get(s.id)||makeTerminal(s);paneHeader(view,s);panes.push(view.pane);}else{
   const empty=document.createElement('section');empty.className='terminal-pane';empty.innerHTML=`<div class="pane-empty"><div class="empty-plus">＋</div><p>${i===0?'Start something new.':'New terminal'}</p><div class="empty-actions"><button data-provider="codex"${state.providers.codex?'':' disabled'}>${icon('codex')}Codex</button><button data-provider="claude"${state.providers.claude?'':' disabled'}>${icon('claude')}Claude</button><button data-provider="shell">${icon('shell')}Shell</button></div></div>`;empty.querySelectorAll('button').forEach(button=>button.onclick=()=>run(()=>createTerminal(button.dataset.provider)));panes.push(empty);
  }
 }
 // Keep live xterm nodes attached during background metadata refreshes.
 for(let i=0;i<panes.length;i++)if(workspace.children[i]!==panes[i])workspace.insertBefore(panes[i],workspace.children[i]||null);
 while(workspace.children.length>panes.length)workspace.lastElementChild.remove();requestAnimationFrame(fitTerminals);
}
function focusSession(id){activeId=id;activeProjects.set(state.selectedProjectId,id);let ids=slots.get(state.selectedProjectId)||[];if(!ids.includes(id)){ids=ids.slice(0,Math.max(0,project().layout-1));ids.push(id);slots.set(state.selectedProjectId,ids);}mode='terminal';expanded=false;api.hidePreview();render();views.get(id)?.terminal.focus();}
function render(){
 for(const [id,view]of views)if(!state.terminals.some(s=>s.id===id)){view.terminal.dispose();views.delete(id);}
 document.body.classList.toggle('preview-mode',mode==='preview');document.body.classList.toggle('expanded-preview',expanded&&mode==='preview');$('preview-workspace').hidden=mode!=='preview';
 renderProjects();renderConversations();renderWorkspace();const p=project();$('status-path').textContent=p?.directory?.replace(/^\/Users\/[^/]+/,'~')||'Orbit · Local workspace';$('terminal-count').textContent=p?`${projectSessions().filter(s=>s.status==='running').length} terminal${projectSessions().filter(s=>s.status==='running').length===1?'':'s'}`:'';
 const url=projectSessions().find(s=>s.previewURL)?.previewURL||p?.previewURL||'';try{$('status-url').innerHTML=url?`${escape(new URL(url).host)}`:'';}catch{$('status-url').textContent='';}
 $('expand-preview').innerHTML=icon(expanded?'restore':'expand');$('expand-preview').setAttribute('aria-label',expanded?'Restore preview':'Expand preview');
 if(mode==='preview'&&currentURL)requestAnimationFrame(updatePreviewBounds);
}
function browserBounds(){const r=$('browser-surface').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};}
function updatePreviewBounds(){if(mode==='preview'&&currentURL&&!$('modal').open)api.previewBounds(browserBounds()).catch(()=>{});}
async function showBrowser(){if(!project()||!currentURL||mode!=='preview'||$('modal').open)return;$('preview-message').hidden=true;const result=await run(()=>api.showPreview({projectId:project().id,sessionId:previewSessionId,url:currentURL,bounds:browserBounds()}));if(result){currentURL=result.url;$('preview-url').value=result.url;$('preview-placeholder').hidden=true;}else{$('preview-placeholder').hidden=false;}}
async function openPreview(session=null){if(!project())return;const s=session||state.terminals.find(s=>s.id===activeId);previewSessionId=s?.id||null;currentURL=s?.previewURL||'';mode='preview';expanded=false;$('preview-url').value=currentURL;$('preview-placeholder').hidden=!!currentURL;render();if(currentURL)await showBrowser();else $('preview-url').focus();}
async function terminalMode(){await api.hidePreview();mode='terminal';expanded=false;render();views.get(activeId)?.terminal.focus();}
async function setLayout(layout){if(!project())return;focused=false;await run(()=>api.updateProject(project().id,{layout}));}
$('new-conversation').onclick=()=>newMenu();$('add-project').onclick=()=>run(()=>addProject());$('project-menu').onclick=()=>projectMenu();$('find-sessions').onclick=()=>run(discoverProjects);
$('conversation-search').oninput=e=>{query=e.target.value.toLowerCase();historyLimit=60;renderConversations();};$('search-shortcut').onclick=()=>{setSidebarCollapsed('conversations',false);$('conversation-search').focus();};$('layout-button').onclick=e=>popup(e.currentTarget,[1,2,4].map(layout=>({label:`${layout} terminal${layout===1?'':'s'}`,icon:'layout',hint:project()?.layout===layout?'Selected':'',action:()=>setLayout(layout)})));
$('back-to-terminal').onclick=()=>run(terminalMode);$('reload-preview').onclick=()=>run(()=>api.reloadPreview());$('expand-preview').onclick=()=>{expanded=!expanded;render();requestAnimationFrame(updatePreviewBounds);};
$('url-form').onsubmit=event=>{event.preventDefault();currentURL=$('preview-url').value;run(showBrowser);};
api.onData(event=>{const view=views.get(event.id);if(!view)return;if(view.ready)view.terminal.write(event.data);else view.pending.push(event);});
api.onState(next=>{const previousId=state.selectedProjectId;state=next;if(previousId&&previousId!==next.selectedProjectId){mode='terminal';expanded=false;focused=false;activeId=activeProjects.get(next.selectedProjectId)||null;api.hidePreview();}render();});
api.onPreview(event=>{if(event.projectId&&event.projectId!==state.selectedProjectId)return;if(event.status==='error'){api.hidePreview();$('preview-placeholder').hidden=false;$('preview-message').textContent=event.message;$('preview-message').hidden=false;}else if(event.status==='ready'&&event.url?.startsWith('http')){currentURL=event.url;$('preview-url').value=event.url;$('preview-placeholder').hidden=true;$('preview-message').hidden=true;}else if(event.status==='notice')toast(event.message,true);});
api.onShortcut(name=>run(async()=>{if(name==='add-project')await addProject();else if(name==='new-conversation')newMenu();else if(name==='new-shell')await createTerminal('shell');else if(name==='toggle-preview')await(mode==='preview'?terminalMode():openPreview());else if(name==='search'){setSidebarCollapsed('conversations',false);$('conversation-search').focus();$('conversation-search').select();}else if(name.startsWith('layout-'))await setLayout(Number(name.split('-')[1]));else if(name==='focus-terminal'){focused=!focused;renderWorkspace();}else if(name==='window-shown'&&mode==='preview'&&currentURL)showBrowser();}));
new ResizeObserver(()=>{requestAnimationFrame(fitTerminals);updatePreviewBounds();}).observe($('terminal-workspace'));new ResizeObserver(updatePreviewBounds).observe($('browser-surface'));window.addEventListener('resize',()=>{fitTerminals();updatePreviewBounds();});
for(const [id,name]of [['brand-icon','orbit'],['search-icon','search'],['history-icon','history'],['folder-icon','folder'],['globe-icon','globe'],['reload-preview','reload'],['expand-preview','expand'],['layout-button','layout']])$(id).innerHTML=icon(name);
run(async()=>{state=await api.getState();render();});

const sidebarDefaults={projects:180,conversations:320};
let sidebarCollapsed={projects:false,conversations:false};
try{const saved=JSON.parse(localStorage.getItem('orbit-sidebar-collapsed')||'{}');for(const key of Object.keys(sidebarCollapsed))if(typeof saved[key]==='boolean')sidebarCollapsed[key]=saved[key];}catch{}
function setSidebarCollapsed(key,value){sidebarCollapsed[key]=value;try{localStorage.setItem('orbit-sidebar-collapsed',JSON.stringify(sidebarCollapsed));}catch{}applySidebarWidths();}
for(const key of ['projects','conversations']){$(`collapse-${key}`).onclick=()=>setSidebarCollapsed(key,true);$(`show-${key}`).onclick=()=>setSidebarCollapsed(key,false);}
let sidebarWidths={...sidebarDefaults};
try{const saved=JSON.parse(localStorage.getItem('orbit-sidebar-widths')||'{}');for(const key of Object.keys(sidebarWidths))if(Number.isFinite(saved[key]))sidebarWidths[key]=saved[key];}catch{}
function applySidebarWidths(save=false){
 for(const key of ['projects','conversations']){document.body.classList.toggle(`${key}-collapsed`,sidebarCollapsed[key]);$(`show-${key}`).hidden=!sidebarCollapsed[key];}
 if(!sidebarCollapsed.projects)sidebarWidths.projects=Math.round(Math.max(120,Math.min(340,sidebarWidths.projects,innerWidth-530)));
 if(!sidebarCollapsed.conversations)sidebarWidths.conversations=Math.round(Math.max(210,Math.min(600,sidebarWidths.conversations,innerWidth-(sidebarCollapsed.projects?0:sidebarWidths.projects)-310)));
 for(const [key,panelId,handleId,min,max] of [['projects','project-sidebar','project-resizer',120,340],['conversations','conversation-sidebar','conversation-resizer',210,600]]){
  $(panelId).style.width=`${sidebarWidths[key]}px`;const handle=$(handleId);handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',sidebarWidths[key]);
 }
 if(save)try{localStorage.setItem('orbit-sidebar-widths',JSON.stringify(sidebarWidths));}catch{}
 requestAnimationFrame(()=>{fitTerminals();updatePreviewBounds();});
}
for(const [id,key] of [['project-resizer','projects'],['conversation-resizer','conversations']]){
 const handle=$(id);let drag=null;
 const end=event=>{if(!drag)return;drag=null;document.body.classList.remove('resizing-sidebar');if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);applySidebarWidths(true);if(mode==='preview'&&currentURL)run(showBrowser);};
 handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={x:event.clientX,width:sidebarWidths[key]};handle.setPointerCapture(event.pointerId);document.body.classList.add('resizing-sidebar');if(mode==='preview')run(()=>api.hidePreview());};
 handle.onpointermove=event=>{if(!drag)return;sidebarWidths[key]=drag.width+event.clientX-drag.x;applySidebarWidths();};
 handle.onpointerup=end;handle.onpointercancel=end;
 handle.ondblclick=()=>{sidebarWidths[key]=sidebarDefaults[key];applySidebarWidths(true);};
 handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();sidebarWidths[key]=event.key==='Home'?sidebarDefaults[key]:sidebarWidths[key]+(event.key==='ArrowLeft'?-10:10);applySidebarWidths(true);};
}
window.addEventListener('resize',()=>applySidebarWidths());
applySidebarWidths();
