import { PhoneConnection } from '../shared/remote-protocol.mjs';
import {sessionStatus,projectActivity} from '../shared/session-status.mjs';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

const $ = selector => document.querySelector(selector);
const views = ['projects', 'live', 'terminal', 'preview', 'create', 'accounts', 'settings'];
const storageKey = 'luce.remote.device.v1';
const state = { projects: [], terminals: [], accounts: [], approvals: [] };
let remoteCapabilities = null;
let connectionReady=false;let liveFilter='open';let renameTargetId=null;let collapsedProjects=new Set();try{collapsedProjects=new Set(JSON.parse(localStorage.getItem('luce.remote.collapsed-projects')||'[]'));}catch{}
let connection = null;
let connectionGeneration = 0;
let reconnectTimer = null;
let handshakeTimer = null;
let reconnectAttempt = 0;
let activeTerminalId = null;
let terminalOffset = 0;
let terminalObservedOffset = 0;
let terminalSnapshotFlight = null;
let terminalRecoveryPromise = null;
let terminalRecoveryRequested = false;
let xterm = null;
let xtermSessionId = null;
let previewRequestPending = false;
const previewActionPending = new Map();
let previewCaptureGeneration = 0;
let previewAwaitingCurrentFrame = true;
let previewMode = 'phone';
let currentView = 'projects';
let pollTimer = null;
let toastTimer = null;
const pendingTerminalWrites = new Set();const terminalDrafts=new Map();let recoveryDraft=null;const pendingApprovals=new Set();

function readPairing() {
  const match = location.hash.match(/^#pair=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const value = JSON.parse(atob(match[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - match[1].length % 4) % 4)));
    if (!value.hostId || !value.deviceId || !value.key || !value.relayURL) throw Error('Incomplete pairing link');
    history.replaceState(null, '', location.pathname + location.search);
    localStorage.setItem(storageKey, JSON.stringify(value));
    return value;
  } catch (error) {
    history.replaceState(null, '', location.pathname + location.search);
    showToast('This pairing link is invalid. Scan a new code from Luce.');
    return null;
  }
}

function storedPairing() {
  try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; }
}

function safeText(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
function escapeAnsi(value) {
  return safeText(value)
    .replace(/\x1B\]52;[^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[PX^_][\s\S]*?\x1B\\/g, '')
    .replace(/\x1B(?!\[)[@-_]/g, '');
}
function project(id) { return state.projects.find(item => item.id === id); }
function terminal(id = activeTerminalId) { return state.terminals.find(item => item.id === id); }
function projectName(id) { return safeText(project(id)?.name, 'Project'); }
function accountName(id) { return safeText(state.accounts.find(item => item.id === id)?.name, 'Codex'); }

function showToast(message) {
  const el = $('#toast'); el.textContent = message; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function setConnection(connected, message) {
  connectionReady=connected;renderTerminal();renderProjects();renderCreate();
  $('#connection-dot').className = `dot ${connected ? 'online' : 'offline'}`;
  $('#connection-label').textContent = message || (connected ? 'Connected' : 'Reconnecting…');
  if (connected) {
    reconnectAttempt = 0; clearTimeout(reconnectTimer); clearTimeout(handshakeTimer);
    refreshState();
    if (currentView === 'terminal') refreshTerminal();
  } else {
    clearTimeout(handshakeTimer);
    scheduleReconnect();
  }
}

function applyState(value) {
  for (const key of ['projects', 'terminals', 'accounts', 'approvals']) state[key] = Array.isArray(value?.[key]) ? value[key] : [];
  if (value?.remoteCapabilities && typeof value.remoteCapabilities === 'object') remoteCapabilities = value.remoteCapabilities;
  if (activeTerminalId && !terminal()) activeTerminalId = null;
  const active = terminal();
  if (active && xterm && xtermSessionId === active.id) {
    const cols = Number(active.cols), rows = Number(active.rows);
    if (cols > 1 && rows > 1 && (xterm.cols !== cols || xterm.rows !== rows)) xterm.resize(cols, rows);
  }
  renderProjects(); renderLive(); renderAccounts(); renderCreate(); renderTerminal(); updatePreviewControls();
  if (['terminal','preview'].includes(currentView) && !activeTerminalId) navigate('live');
}

function navigate(view) {
  if (!views.includes(view)) return;
  if(view==='terminal'&&!terminal())view='live';
  currentView = view;
  for (const name of views) $(`#${name}-view`).hidden = name !== view;
  $('#pair-screen').hidden = true;
  $('#tabbar').hidden = false;
  document.querySelectorAll('#tabbar button').forEach(button => button.classList.toggle('active', button.dataset.view === (['live','preview'].includes(view) ? 'terminal' : view)));
  if (view === 'preview') startPreview(); else stopPreview();
  renderLive();if (view === 'terminal') refreshTerminal();
}

function showUnpaired() {
  $('#pair-screen').hidden = false; $('#tabbar').hidden = true;
  for (const view of views) $(`#${view}-view`).hidden = true;
  $('#connection-label').textContent = 'Not paired';
  $('#connection-dot').className = 'dot offline';
}

function connect(pair) {
  clearTimeout(reconnectTimer); clearTimeout(handshakeTimer);
  connectionReady=false;remoteCapabilities = null; updatePreviewControls();renderTerminal(); invalidatePreviewFrame();
  const previous = connection;
  connection = null;
  previous?.close();
  const currentConnection = new PhoneConnection(pair);
  connectionGeneration += 1;
  const generation = connectionGeneration;
  connection = currentConnection;
  const isCurrent = () => connection === currentConnection && connectionGeneration === generation;
  currentConnection.onStatus(status => {
    if (!isCurrent()) return;
    if (status?.ready) { setConnection(true, status.message); return; }
    if (status?.connected) {
      $('#connection-dot').className = 'dot offline';
      $('#connection-label').textContent = 'Securing connection…';
      if (!handshakeTimer) handshakeTimer = setTimeout(() => {
        if (isCurrent()) {
          currentConnection.close();
          setConnection(false, 'Secure connection timed out.');
        }
      }, 15000);
      return;
    }
    setConnection(false, status?.message);
  });
  currentConnection.onEvent('state', value => { if (isCurrent()) applyState(value); });
  currentConnection.onEvent('terminal-data', payload => {
    if (!isCurrent()) return;
    const currentTerminal = terminal(); if (!currentTerminal || payload?.id !== currentTerminal.id) return;
    appendTerminalData(payload);
  });
  currentConnection.onEvent('terminal-resync', payload => {
    if (!isCurrent() || (payload?.all !== true && payload?.id !== activeTerminalId)) return;
    recoverTerminalGap(true);
  });
  currentConnection.onEvent('approvals', value => { if (!isCurrent()) return; state.approvals = Array.isArray(value) ? value : []; renderProjects();renderLive();renderTerminal(); });
  currentConnection.onEvent('notice', value => { if (isCurrent() && value?.message) showToast(value.message); });
  currentConnection.connect().catch(error => { if (isCurrent()) setConnection(false, safeText(error?.message, 'Disconnected')); });
}

function scheduleReconnect() {
  if (!connection || document.hidden || !navigator.onLine || reconnectTimer) return;
  const delay = Math.min(15000, 800 * (2 ** Math.min(reconnectAttempt++, 4)));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const pair = storedPairing();
    if (pair) connect(pair);
  }, delay);
}

async function request(method, params = {}) {
  if (!connection) throw Error('This phone is not paired.');
  return connection.request(method, params);
}

async function refreshState() {
  const source=connection,generation=connectionGeneration;try { const value = await source?.request('state'); if(source===connection&&generation===connectionGeneration)applyState(value); }
  catch (error) { if(source!==connection||generation!==connectionGeneration)return;showToast(`Could not refresh Luce: ${safeText(error?.message, 'connection error')}`); }
}

async function refreshTerminal() {
  const active = terminal(); const sourceConnection = connection; const generation = connectionGeneration;
  if (!active || !sourceConnection) return false;
  const existing = terminalSnapshotFlight;
  if (existing?.id === active.id && existing.generation === generation) return existing.promise;
  const flight = {id: active.id, generation, promise: null};
  const work = (async () => {
    try {
      const snapshot = await sourceConnection.request('terminalSnapshot', {id: active.id});
      if (connection !== sourceConnection || connectionGeneration !== generation || terminal()?.id !== active.id) return false;
      const cols = Number(snapshot?.cols) || 90, rows = Number(snapshot?.rows) || 24;
      if (!xterm || xtermSessionId !== active.id) {
        xterm?.dispose();
        xterm = new Terminal({cols, rows, disableStdin: true, cursorBlink: false, scrollback: 5000, convertEol: true, fontSize: 12, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', theme: {background:'#282a2c',foreground:'#ececec',cursor:'#ececec',cursorAccent:'#282a2c',selectionBackground:'#55503b',black:'#202426',red:'#e85c57',green:'#43d17a',yellow:'#e5c454',blue:'#58a6ff',magenta:'#c678dd',cyan:'#56d4dd',white:'#dce4e3',brightBlack:'#a8b0bb',brightRed:'#e7ad98',brightGreen:'#b4e4bb',brightYellow:'#ead8ad',brightBlue:'#a0cede',brightMagenta:'#cfc0e8',brightCyan:'#a4d9d3',brightWhite:'#f2f6f4'}});
        xterm.open($('#terminal-output')); xtermSessionId = active.id;
      } else if (xterm.cols !== cols || xterm.rows !== rows) {
        // Resize only the phone renderer. The Mac PTY keeps its original geometry.
        xterm.resize(cols, rows);
      }
      const screen = xterm;
      screen.reset(); screen.write(escapeAnsi(snapshot?.buffer || ''), () => {
        if (connection === sourceConnection && connectionGeneration === generation && terminal()?.id === active.id && xterm === screen) screen.scrollToBottom();
      });
      terminalOffset = Number(snapshot?.outputOffset) || 0;
      terminalObservedOffset = Math.max(terminalObservedOffset, terminalOffset);
      renderTerminal();
      return true;
    } catch (error) {
      if (connection === sourceConnection && connectionGeneration === generation) showToast(`Could not load terminal: ${safeText(error?.message, 'connection error')}`);
      return false;
    }
  })();
  flight.promise = work.finally(() => { if (terminalSnapshotFlight === flight) terminalSnapshotFlight = null; });
  terminalSnapshotFlight = flight;
  return flight.promise;
}

function appendTerminalData(payload) {
  const data = safeText(payload.data);
  const end = Number(payload.offset);
  if (Number.isFinite(end) && end > 0) {
    const start = end - data.length;
    terminalObservedOffset = Math.max(terminalObservedOffset, end);
    if (end <= terminalOffset) return;
    if (start > terminalOffset) { recoverTerminalGap(); return; }
    const skip = Math.max(0, terminalOffset - start);
    if (skip < data.length) xterm?.write(escapeAnsi(data.slice(skip)));
    terminalOffset = end;
  } else xterm?.write(escapeAnsi(data));
  xterm?.scrollToBottom();
}

function recoverTerminalGap(forceSnapshot = false) {
  if (terminalRecoveryPromise) { terminalRecoveryRequested = true; return terminalRecoveryPromise; }
  const id = activeTerminalId, generation = connectionGeneration;
  const flight = terminalSnapshotFlight;
  let requiredPasses = forceSnapshot && flight?.id === id && flight.generation === generation ? 2 : 1;
  terminalRecoveryRequested = false;
  const work = (async () => {
    do {
      terminalRecoveryRequested = false;
      const recovered = await refreshTerminal();
      if (!recovered || id !== activeTerminalId || generation !== connectionGeneration) break;
      requiredPasses -= 1;
    } while (requiredPasses > 0 || terminalRecoveryRequested || terminalObservedOffset > terminalOffset);
  })();
  terminalRecoveryPromise = work.finally(() => { terminalRecoveryPromise = null; });
  return terminalRecoveryPromise;
}

function formatSize(bytes){if(!Number.isFinite(bytes))return '';return bytes<1048576?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1048576).toFixed(1)} MB`;}
function activityBadges(item){const n=projectActivity(item.id,state.terminals,state.approvals),alerts=n.attention+n.finished;return `${n.working?`<span class="status-dot status-working" role="img" aria-label="${n.working} working" title="${n.working} working">${n.working>1?`<small>${n.working}</small>`:''}</span>`:''}${alerts?`<span class="status-dot status-attention" role="img" aria-label="${n.attention} need input, ${n.finished} finished" title="${n.attention} need input, ${n.finished} finished">${alerts>1?`<small>${alerts}</small>`:''}</span>`:''}<span class="open-count" title="${n.open} open terminals">${n.open}</span>`;}
function matchesSession(s,query){return `${s.title||''} ${projectName(s.projectId)} ${s.provider||''} ${accountName(s.accountId)}`.toLowerCase().includes(query);}
function sessionRow(session,showProject=false){const row=document.createElement('button');row.type='button';row.className='session-row';row.dataset.terminalId=session.id;const title=document.createElement('strong');title.textContent=safeText(session.title,'Terminal');const meta=document.createElement('small');meta.className='session-meta';const status=sessionStatus(session,state.approvals);const phase=document.createElement('span');phase.className=`session-phase phase-${status.key}`;phase.textContent=status.label;const detail=document.createElement('span');detail.textContent=[showProject?projectName(session.projectId):'',session.provider==='codex'?accountName(session.accountId):safeText(session.provider,'shell'),formatSize(session.diskBytes)].filter(Boolean).join(' · ');meta.append(phase,detail);row.append(title,meta);row.onclick=()=>openTerminal(session.id);return row;}
function renderProjects(){const root=$('#project-list');root.replaceChildren();$('#project-count').textContent=String(state.projects.length);const query=$('#project-search').value.trim().toLowerCase();let shown=0;for(const item of state.projects){const all=state.terminals.filter(t=>t.projectId===item.id),projectMatches=`${item.name} ${item.directory||item.path||''}`.toLowerCase().includes(query),items=all.filter(s=>projectMatches||matchesSession(s,query));if(!projectMatches&&!items.length)continue;shown++;const card=document.createElement('article');card.className='project-group';const button=document.createElement('button');button.className='project-header';button.type='button';button.dataset.projectId=item.id;button.innerHTML='<span class="project-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg></span><span class="project-copy"><strong></strong><small></small></span><span class="project-activity"></span><span class="project-chevron" aria-hidden="true">⌄</span>';button.querySelector('strong').textContent=safeText(item.name,'Project');button.querySelector('small').textContent=safeText(item.directory||item.path,'On your Mac');button.querySelector('.project-activity').innerHTML=activityBadges(item);const collapsed=collapsedProjects.has(item.id)&&!query;button.setAttribute('aria-expanded',String(!collapsed));button.onclick=()=>{if(collapsedProjects.has(item.id))collapsedProjects.delete(item.id);else collapsedProjects.add(item.id);localStorage.setItem('luce.remote.collapsed-projects',JSON.stringify([...collapsedProjects]));renderProjects();};card.append(button);const sessions=document.createElement('div');sessions.className='project-terminals';sessions.hidden=collapsed;for(const session of items.filter(s=>s.status!=='exited'))sessions.append(sessionRow(session));const ended=items.filter(s=>s.status==='exited');if(ended.length){const details=document.createElement('details');details.className='ended-sessions';const summary=document.createElement('summary');summary.textContent=`${ended.length} exited terminal${ended.length===1?'':'s'}`;details.append(summary);for(const session of ended)details.append(sessionRow(session));sessions.append(details);}const add=document.createElement('button');add.className='project-new';add.disabled=!connectionReady;add.textContent='+ New terminal';add.onclick=()=>{renderCreate(item.id);navigate('create');};sessions.append(add);card.append(sessions);root.append(card);}if(!shown)root.innerHTML=`<div class="empty-state">${state.projects.length?'No matching projects or conversations.':'Add a project in Luce on your Mac to get started.'}</div>`;}
function renderLive(){const root=$('#live-list');root.replaceChildren();if(currentView!=='live')return;const counts=state.projects.map(p=>projectActivity(p.id,state.terminals,state.approvals));const sum=key=>counts.reduce((n,c)=>n+c[key],0);$('#live-summary').textContent=`${sum('open')} open · ${sum('working')} working · ${sum('attention')} need input`;const query=$('#live-search').value.trim().toLowerCase();const rows=state.terminals.filter(s=>matchesSession(s,query)&&(liveFilter==='all'||liveFilter==='open'&&s.status==='running'||sessionStatus(s,state.approvals).key===liveFilter));const rank={attention:0,working:1,finished:2,waiting:3,ready:4,exited:5};rows.sort((a,b)=>(rank[sessionStatus(a,state.approvals).key]??6)-(rank[sessionStatus(b,state.approvals).key]??6));for(const s of rows)root.append(sessionRow(s,true));if(!rows.length)root.innerHTML='<div class="empty-state">No terminals in this view. Start one from New or choose another filter.</div>';$('#live-filters').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===liveFilter)));}

function openTerminal(id) { if (!terminal(id)) return; if (activeTerminalId !== id) {if(activeTerminalId)terminalDrafts.set(activeTerminalId,$('#terminal-message').value);$('#terminal-message').value=terminalDrafts.get(id)||''; terminalOffset = 0; terminalObservedOffset = 0; } activeTerminalId = id; if (xtermSessionId !== id) { xterm?.dispose(); xterm = null; xtermSessionId = null; } renderTerminal(); navigate('terminal'); }

function renderTerminal() {
  const active = terminal();
  if (!active) return;
  $('#terminal-project').textContent = projectName(active.projectId);
  $('#terminal-title').textContent = safeText(active.title, 'Terminal');
  $('#terminal-provider').textContent = safeText(active.provider, 'shell');$('#session-compatibility').hidden=remoteCapabilities?.sessionControls===true;
  const phase=sessionStatus(active,state.approvals);$('#terminal-status').textContent=phase.label;$('#terminal-status').className=`session-phase phase-${phase.key}`;$('#terminal-size').textContent=formatSize(active.diskBytes);const switcher=$('#terminal-switcher');switcher.replaceChildren();for(const p of state.projects){const group=document.createElement('optgroup');group.label=p.name;for(const t of state.terminals.filter(t=>t.projectId===p.id)){const option=document.createElement('option');option.value=t.id;option.textContent=`${t.title||'Terminal'} · ${sessionStatus(t,state.approvals).label}`;group.append(option);}if(group.children.length)switcher.append(group);}switcher.value=active.id;$('#rename-terminal').disabled=!connectionReady||remoteCapabilities?.sessionControls!==true;const auto=$('#terminal-auto');auto.hidden=active.provider==='shell';auto.disabled=!connectionReady||remoteCapabilities?.sessionControls!==true||!active.approvalsCapable||active.status!=='running';auto.setAttribute('aria-checked',String(!!active.autoApprove));auto.classList.toggle('enabled',!!active.autoApprove);auto.title=remoteCapabilities?.sessionControls===true?'Approve permission requests automatically; questions always stay manual':'Restart Luce on your Mac to enable session controls';
  $('#terminal-account').textContent = active.provider === 'codex' ? accountName(active.accountId) : '';
  const exited = active.status === 'exited';const unavailable=active.status!=='running'||!connectionReady;
  $('#terminal-exited').hidden = !exited;
  if (exited) {
    const code = Number(active.exitCode);
    $('#terminal-exit-reason').textContent = Number.isInteger(code)
      ? code === 0 ? 'Process exited normally (exit code 0).' : `Process exited with exit code ${code}.`
      : 'This terminal has exited.';
  }
  for (const selector of ['#interrupt-button', '#clear-button', '#paste-button', '#terminal-message']) $(selector).disabled = unavailable;
  $('#enter-button').disabled = unavailable || pendingTerminalWrites.has(active.id);
  $('#send-button').disabled = unavailable || pendingTerminalWrites.has(active.id);
  $('#close-button').disabled = !connectionReady;
  $('#preview-button').disabled = exited && !active.previewAvailable;
  $('#terminal-toolbar').hidden = false;
  renderApprovals();
}

function renderApprovals() {
  const root = $('#approval-list'); root.replaceChildren();
  const active = terminal(); if (!active) return;
  for (const approval of state.approvals.filter(item => item.terminalId === active.id && ((item.state||item.status||'pending')==='pending'))) {
    const card = document.createElement('article'); card.className = 'approval-card';
    const header = document.createElement('header'); header.textContent = safeText(approval.title, `${safeText(approval.provider, active.provider)} needs approval`);
    const detail = document.createElement('p'); detail.textContent = safeText(approval.summary, safeText(approval.detail, safeText(approval.tool, 'Action')));
    const footer = document.createElement('footer');
    for (const [decision, label] of [['decline', 'Decline'], ['accept', `Approve ${safeText(approval.title, safeText(approval.tool, 'action'))}`]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = decision === 'accept' ? 'primary-button' : 'secondary-button'; button.textContent = label; button.setAttribute('aria-label', decision === 'accept' ? label : 'Decline approval');
      button.disabled=!connectionReady||pendingApprovals.has(approval.requestId||approval.id);button.addEventListener('click', () => resolveApproval(approval.requestId || approval.id, decision, button)); footer.append(button);
    }
    card.append(header, detail, footer); root.append(card);
  }
}

async function resolveApproval(requestId, decision, button) {
  if(pendingApprovals.has(requestId))return;pendingApprovals.add(requestId);renderApprovals();
  try { await request('approve', { requestId, decision }); showToast(decision === 'accept' ? 'Approved.' : 'Declined.'); await refreshState(); }
  catch (error) {showToast(`Approval failed: ${safeText(error?.message,'connection error')}`);}finally{pendingApprovals.delete(requestId);renderApprovals();}
}

function renderCreate(projectId, provider, accountId) {
  $('#create-form button[type="submit"]').disabled=!connectionReady||!state.projects.length;
  const previousProjectId = $('#create-project').value;
  const previousProvider = $('#create-provider').value;
  const previousAccountId = $('#create-account').value;
  const projectSelect = $('#create-project'); projectSelect.replaceChildren();
  for (const item of state.projects) { const option = document.createElement('option'); option.value = item.id; option.textContent = safeText(item.name, 'Project'); projectSelect.append(option); }
  const selectedProjectId = projectId || previousProjectId;
  if ([...projectSelect.options].some(option => option.value === selectedProjectId)) projectSelect.value = selectedProjectId;
  const providerSelect = $('#create-provider');
  const selectedProvider = provider || previousProvider;
  if ([...providerSelect.options].some(option => option.value === selectedProvider)) providerSelect.value = selectedProvider;
  const accountSelect = $('#create-account'); accountSelect.replaceChildren();
  for (const item of state.accounts) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = `${safeText(item.name, 'Codex')}${item.status === 'signed-in' ? '' : ' · sign in on Mac'}`; option.disabled = item.status && item.status !== 'signed-in'; accountSelect.append(option);
  }
  if (!accountSelect.options.length) { const option = document.createElement('option'); option.value = 'default'; option.textContent = 'Default Codex account'; accountSelect.append(option); }
  const selectedAccountId = accountId || previousAccountId;
  const validSelectedAccount = [...accountSelect.options].find(option => option.value === selectedAccountId && !option.disabled);
  if (validSelectedAccount) accountSelect.value = validSelectedAccount.value;
  else {
    const fallbackAccount = [...accountSelect.options].find(option => !option.disabled);
    if (fallbackAccount) accountSelect.value = fallbackAccount.value;
  }
  $('#account-field').hidden = providerSelect.value !== 'codex';
}

function renderAccounts() {
  const root = $('#accounts-list'); root.replaceChildren();
  if (!state.accounts.length) root.innerHTML = '<div class="empty-state">No Codex accounts are available.</div>';
  for (const account of state.accounts) {
    const card = document.createElement('article'); card.className = 'account-card';
    const heading = document.createElement('h2'); heading.textContent = safeText(account.name, 'Codex account');
    const identity = document.createElement('p'); identity.textContent = [safeText(account.email, account.status || ''), safeText(account.plan)].filter(Boolean).join(' · ');
    card.append(heading, identity);
    const usage = account.usage;
    if (usage?.windows?.length) for (const window of usage.windows) {
      const row = document.createElement('div'); row.className = 'usage-row';
      const label = document.createElement('span'); label.textContent = safeText(window.label, 'Usage');
      const remain = document.createElement('strong'); remain.textContent = `${Math.round(100 - (Number(window.usedPercent) || 0))}% left`;
      const progress = document.createElement('progress'); progress.max = 100; progress.value = Math.max(0, 100 - (Number(window.usedPercent) || 0)); progress.setAttribute('aria-label', `${safeText(window.label, 'Usage')} remaining`);
      row.append(label, remain); card.append(row, progress);
      const reset = document.createElement('small'); reset.textContent = window.resetsAt ? `Resets ${new Date(window.resetsAt * 1000).toLocaleString()}` : 'Reset time unavailable'; card.append(reset);
    } else { const note = document.createElement('p'); note.textContent = 'Usage information is not available.'; card.append(note); }
    root.append(card);
  }
}

function renderCreateProvider() { $('#account-field').hidden = $('#create-provider').value !== 'codex'; }

async function confirmed(message, action, label) {
  $('#confirm-copy').textContent = message; $('#confirm-action').textContent = label;
  const dialog = $('#confirm-dialog'); dialog.showModal();
  const result = await new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }); });
  if (result !== 'confirm') return;
  try { await action(); } catch (error) { showToast(safeText(error?.message, 'Request failed')); }
}

async function sendText(value) {
  const active = terminal(); if (!active || active.status !== 'running' || !value || pendingTerminalWrites.has(active.id)) return;
  pendingTerminalWrites.add(active.id); renderTerminal();
  try {
    try { await request('submit', { id: active.id, data: value }); }
    catch (error) {
      if (error?.message !== 'Unsupported remote operation.') throw error;
      await request('write', { id: active.id, data: value });
      await new Promise(resolve => setTimeout(resolve, 250));
      const latest = await request('state');
      applyState(latest);
      const current = latest?.terminals?.find(item => item.id === active.id);
      if (current?.status !== 'running') throw Error('This terminal has exited. Start another terminal to continue.');
      await request('write', { id: active.id, data: '\r' });
    }
    const input = $('#terminal-message');
    if(activeTerminalId===active.id&&input.value===value){input.value='';terminalDrafts.delete(active.id);}else if(terminalDrafts.get(active.id)===value)terminalDrafts.delete(active.id);
  }
  catch (error) { showToast(`Send failed: ${safeText(error?.message, 'connection error')}`); }
  finally { pendingTerminalWrites.delete(active.id); renderTerminal(); }
}

async function sendEnter() {
  const active = terminal(); if (!active || active.status !== 'running' || pendingTerminalWrites.has(active.id)) return;
  pendingTerminalWrites.add(active.id); renderTerminal();
  try { await request('write', { id: active.id, data: '\r' }); }
  catch (error) { showToast(`Enter failed: ${safeText(error?.message, 'connection error')}`); }
  finally { pendingTerminalWrites.delete(active.id); renderTerminal(); }
}

async function refreshPreview() {
  const actionKey = `${activeTerminalId}\0${previewMode}`;
  if (document.hidden || currentView !== 'preview' || !terminal() || previewRequestPending || previewActionPending.get(actionKey)) return;
  const requestId = activeTerminalId, requestMode = previewMode, generation = ++previewCaptureGeneration;
  previewRequestPending = true;
  try {
    const params = previewViewportParams();
    const frame = await request('preview', params);
    if (generation !== previewCaptureGeneration || currentView !== 'preview' || activeTerminalId !== requestId || previewMode !== requestMode) return;
    if (!frame?.jpeg) throw Error('Website preview is empty. Try reloading the page.');
    const src = frame?.jpeg?.startsWith('data:image/jpeg;base64,') ? frame.jpeg : `data:image/jpeg;base64,${frame?.jpeg || ''}`;
    const decoded = new Image(); decoded.src = src; await decoded.decode();
    if (generation !== previewCaptureGeneration || currentView !== 'preview' || activeTerminalId !== requestId || previewMode !== requestMode) return;
    const image = $('#preview-image'); image.src = src; await image.decode();
    if (generation !== previewCaptureGeneration || currentView !== 'preview' || activeTerminalId !== requestId || previewMode !== requestMode) return;
    image.dataset.width = String(frame.width || 0); image.dataset.height = String(frame.height || 0);
    image.dataset.mode = requestMode; image.dataset.terminalId = requestId;
    $('#preview-empty').hidden = true;
    previewAwaitingCurrentFrame = false;
  } catch (error) {
    if (generation === previewCaptureGeneration) { $('#preview-empty').textContent = safeText(error?.message, 'Website preview is unavailable.'); $('#preview-empty').hidden = false; previewAwaitingCurrentFrame = true; }
  }
  finally { if (generation === previewCaptureGeneration) previewRequestPending = false; }
}

function previewViewportParams() {
  const params = { id: activeTerminalId, mode: previewMode };
  if (previewMode === 'phone') {
    const frame = $('#preview-frame');
    params.width = Math.max(320, Math.min(1280, Math.round(frame.clientWidth || 390)));
    params.height = Math.max(320, Math.min(1600, Math.round(frame.clientHeight || 700)));
  }
  return params;
}
function invalidatePreviewFrame() {
  previewCaptureGeneration += 1; previewRequestPending = false; previewAwaitingCurrentFrame = true;
  $('#preview-empty').textContent = `Loading ${previewMode} website view…`; $('#preview-empty').hidden = false;
}
function startPreview() { stopPreview(); invalidatePreviewFrame(); refreshPreview(); pollTimer = setInterval(refreshPreview, 1300); }
function stopPreview() { clearInterval(pollTimer); pollTimer = null; invalidatePreviewFrame(); }
function previewPoint(clientX, clientY) {
  const image = $('#preview-image');
  const bounds = image.getBoundingClientRect();
  const width = Number(image.dataset.width) || bounds.width; const height = Number(image.dataset.height) || bounds.height;
  const scale = Math.min(bounds.width / width, bounds.height / height);
  const renderedWidth = width * scale, renderedHeight = height * scale;
  const left = bounds.left + (bounds.width - renderedWidth) / 2, top = bounds.top + (bounds.height - renderedHeight) / 2;
  const x = (clientX - left) / renderedWidth, y = (clientY - top) / renderedHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {x, y};
}

function updatePreviewControls() {
  const supported = remoteCapabilities?.previewControls === true;
  $('#preview-compatibility').hidden = supported;
  document.querySelectorAll('#preview-back,#preview-forward,#preview-reload,#preview-phone-mode,#preview-desktop-mode,#preview-text,#preview-text-form button,[data-preview-key]').forEach(control => { control.disabled = !supported; });
  $('#preview-phone-mode').classList.toggle('selected', previewMode === 'phone');
  $('#preview-desktop-mode').classList.toggle('selected', previewMode === 'desktop');
  $('#preview-phone-mode').setAttribute('aria-pressed', String(previewMode === 'phone'));
  $('#preview-desktop-mode').setAttribute('aria-pressed', String(previewMode === 'desktop'));
}

async function previewInput(input) {
  if (remoteCapabilities?.previewControls !== true && !['click', 'scroll'].includes(input.type)) { showToast('Restart Luce on your Mac to enable these website controls.'); return false; }
  const image = $('#preview-image');
  if (image.dataset.mode !== previewMode || image.dataset.terminalId !== activeTerminalId || previewAwaitingCurrentFrame && ['click', 'scroll'].includes(input.type)) return false;
  const context = { id: image.dataset.terminalId, mode: image.dataset.mode };
  const actionKey = `${context.id}\0${context.mode}`;
  const changesPage = ['click', 'scroll', 'navigate'].includes(input.type) || input.type === 'key' && input.key === 'Enter';
  if (changesPage) { previewActionPending.set(actionKey, (previewActionPending.get(actionKey) || 0) + 1); invalidatePreviewFrame(); }
  context.generation = previewCaptureGeneration;
  try {
    await request('previewInput', { id: context.id, mode: context.mode, width: Number(image.dataset.width), height: Number(image.dataset.height), ...input });
    return true;
  }
  catch (error) {
    const current = currentView === 'preview' && activeTerminalId === context.id && previewMode === context.mode && previewCaptureGeneration === context.generation;
    if (current) { $('#preview-empty').textContent = safeText(error?.message, 'Website control failed.'); $('#preview-empty').hidden = false; }
    return false;
  } finally {
    if (changesPage) {
      const pending = (previewActionPending.get(actionKey) || 1) - 1;
      if (pending) previewActionPending.set(actionKey, pending); else previewActionPending.delete(actionKey);
      if (currentView === 'preview') setTimeout(refreshPreview, 100);
    }
  }
}

async function notifyUserForPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { showToast('Push notifications are unavailable in this browser.'); return; }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') { showToast('Notifications are disabled for this site.'); return; }
  try {
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await request('pushKey');
    if (!publicKey) throw Error('Notifications are not configured on the Mac.');
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(publicKey) });
    await request('pushSubscribe', { subscription: subscription.toJSON() });
    $('#push-button').textContent = 'Enabled'; showToast('Push notifications enabled.');
  } catch (error) { showToast(`Could not enable notifications: ${safeText(error?.message)}`); }
}

function decodeBase64Url(text) { const bytes = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)); return Uint8Array.from(bytes, c => c.charCodeAt(0)); }

function showInfo(title, content) { $('#info-title').textContent = title; $('#info-copy').replaceChildren(content); $('#info-dialog').showModal(); }
function homeInstructions() {
  const copy = document.createElement('div');
  const p = document.createElement('p'); p.textContent = /iphone|ipad/i.test(navigator.userAgent) ? 'In Safari, tap Share, then choose Add to Home Screen.' : /android/i.test(navigator.userAgent) ? 'In Chrome, open the menu and choose Install app or Add to Home screen.' : 'Use your browser menu to install Luce Remote or add it to your home screen.';
  const note = document.createElement('p'); note.textContent = 'Keep this browser profile on the device you paired. Clearing browser data removes the saved pairing.';
  copy.append(p, note); showInfo('Add Luce to your home screen', copy);
}

async function installServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch { /* The remote controls work without offline shell caching. */ }
}

$('#project-search').addEventListener('input',renderProjects);$('#live-search').addEventListener('input',renderLive);$('#refresh-live').onclick=refreshState;$('#live-filters').onclick=event=>{const b=event.target.closest('[data-filter]');if(b){liveFilter=b.dataset.filter;renderLive();}};$('#terminal-switcher').onchange=event=>openTerminal(event.target.value);$('.brand').onclick=event=>{event.preventDefault();if(storedPairing())navigate('projects');};
$('#rename-terminal').onclick=()=>{const active=terminal();if(!active)return;renameTargetId=active.id;$('#rename-input').value=active.title||'';$('#rename-dialog').showModal();$('#rename-input').focus();};$('#rename-cancel').onclick=()=>$('#rename-dialog').close();$('#rename-form').onsubmit=async event=>{event.preventDefault();const id=renameTargetId,title=$('#rename-input').value.trim(),button=event.submitter;if(!id||!title)return;if(button)button.disabled=true;try{await request('rename',{id,title});$('#rename-dialog').close();await refreshState();}catch(error){showToast(safeText(error.message));}finally{if(button)button.disabled=false;}};$('#terminal-auto').onclick=async()=>{const active=terminal();if(!active)return;try{await request('autoApprove',{id:active.id,enabled:!active.autoApprove});await refreshState();}catch(error){showToast(safeText(error.message));}};
$('#composer').addEventListener('submit', event => { event.preventDefault(); sendText($('#terminal-message').value); });
$('#paste-button').addEventListener('click', async () => { try { const text = await navigator.clipboard.readText(); $('#terminal-message').setRangeText(text, $('#terminal-message').selectionStart, $('#terminal-message').selectionEnd, 'end'); $('#terminal-message').focus(); } catch { showToast('Clipboard access is unavailable. Select the text field and use Paste.'); } });
$('#enter-button').addEventListener('click', sendEnter);
$('#interrupt-button').addEventListener('click',()=>{const id=activeTerminalId;confirmed('Send Ctrl-C to this terminal?',()=>request('interrupt',{id}),'Confirm interrupt');});
$('#clear-button').addEventListener('click',()=>{const id=activeTerminalId;confirmed('Clear the visible terminal by sending Ctrl-L?',()=>request('write',{id,data:'\x0c'}),'Clear terminal');});
$('#close-button').addEventListener('click',()=>{const id=activeTerminalId;confirmed('Close this terminal on your Mac?',async()=>{await request('close',{id});terminalDrafts.delete(id);if(activeTerminalId===id)activeTerminalId=null;await refreshState();if(!activeTerminalId)navigate('live');},'Close terminal');});
$('#usage-button').addEventListener('click',()=>{const active=terminal();if(!active)return;const account=state.accounts.find(a=>a.id===active.accountId),usage=active.usage||account?.usage,copy=document.createElement('div');if(usage?.windows?.length){for(const w of usage.windows){const row=document.createElement('div');row.className='usage-row';const label=document.createElement('span');label.textContent=w.label||'Usage';const value=document.createElement('strong');const used=Number(w.usedPercent),valid=w.usedPercent!==null&&w.usedPercent!==undefined&&Number.isFinite(used);value.textContent=valid?`${Math.round(Math.max(0,Math.min(100,100-used)))}% left`:'Unavailable';row.append(label,value);copy.append(row);if(valid){const progress=document.createElement('progress');progress.max=100;progress.value=Math.max(0,Math.min(100,100-used));progress.setAttribute('aria-label',`${w.label||'Usage'} remaining`);copy.append(progress);}}}else{const note=document.createElement('p');note.textContent='Usage information is not available from the provider yet.';copy.append(note);}const note=document.createElement('p');note.className='privacy-note';note.textContent='Provider-reported account limits are shared across its conversations.';copy.append(note);showInfo(`${active.provider==='codex'?accountName(active.accountId):'Claude'} usage`,copy);});
$('#preview-button').addEventListener('click', () => navigate('preview'));
$('#back-projects').addEventListener('click', () => navigate('live'));
$('#back-terminal').addEventListener('click', () => navigate('terminal'));
$('#start-another-terminal').addEventListener('click', () => {
  const active = terminal();
  if (!active || active.status !== 'exited') return;
  recoveryDraft={id:active.id,text:$('#terminal-message').value};renderCreate(active.projectId, active.provider, active.accountId);
  navigate('create');
});
$('#fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#preview-view').requestFullscreen(); } catch { showToast('Full screen is unavailable.'); } });
$('#preview-phone-mode').addEventListener('click', () => { if (previewMode === 'phone') return; previewMode = 'phone'; updatePreviewControls(); invalidatePreviewFrame(); refreshPreview(); });
$('#preview-desktop-mode').addEventListener('click', () => { if (previewMode === 'desktop') return; previewMode = 'desktop'; updatePreviewControls(); invalidatePreviewFrame(); refreshPreview(); });
$('#preview-back').addEventListener('click', () => previewInput({ type: 'navigate', action: 'back' }));
$('#preview-forward').addEventListener('click', () => previewInput({ type: 'navigate', action: 'forward' }));
$('#preview-reload').addEventListener('click', () => previewInput({ type: 'navigate', action: 'reload' }));
$('#preview-text-form').addEventListener('submit', async event => {
  event.preventDefault();
  const field = $('#preview-text'), value = field.value;
  if (value && await previewInput({ type: 'text', text: value }) && field.value === value) field.value = '';
});
document.querySelectorAll('[data-preview-key]').forEach(button => button.addEventListener('click', () => previewInput({ type: 'key', key: button.dataset.previewKey })));
$('#tabbar').addEventListener('click', event => { const button = event.target.closest('button[data-view]'); if (button) navigate(button.dataset.view==='terminal'?'live':button.dataset.view); });
$('#create-provider').addEventListener('change', renderCreateProvider);
$('#create-form').addEventListener('submit', async event => {
  event.preventDefault(); if(!connectionReady){showToast('Reconnect to your Mac before creating a terminal.');return;} const button = event.submitter; if (button) button.disabled = true;
  const params = { projectId: $('#create-project').value, provider: $('#create-provider').value };
  if (params.provider === 'codex') params.accountId = $('#create-account').value || 'default';
  try { const created = await request('create', params); await refreshState(); if (created?.id){if(recoveryDraft){terminalDrafts.set(created.id,recoveryDraft.text);recoveryDraft=null;}openTerminal(created.id);} else { const latest = state.terminals.find(item => item.projectId === params.projectId && item.provider === params.provider); if (latest) openTerminal(latest.id); } }
  catch (error) { showToast(`Could not create terminal: ${safeText(error?.message)}`); }
  finally { if (button) button.disabled = !connectionReady; }
});
$('#home-instructions').addEventListener('click', homeInstructions);
$('#home-instructions').addEventListener('keydown', event => { if (event.key === 'Enter') homeInstructions(); });
$('#push-button').addEventListener('click', notifyUserForPush);
$('#device-menu').addEventListener('click', () => navigate('settings'));
$('#pair-help').addEventListener('click', () => showToast('Open Remote in Luce on your Mac and scan its pairing code.'));
$('#forget-device').addEventListener('click', () => confirmed('Forget this phone here? This clears its saved pairing. Revoke the device in Luce on your Mac to disable its key.', async () => { try { await request('pushUnsubscribe', {}); } catch {} const previous = connection; connection = null; clearTimeout(reconnectTimer); clearTimeout(handshakeTimer); previous?.close(); localStorage.removeItem(storageKey); showUnpaired(); }, 'Forget device'));

const previewFrame = $('#preview-frame');
let previewStart = null;
previewFrame.addEventListener('pointerdown', event => {
  const point = previewPoint(event.clientX, event.clientY);
  if (!point) { previewStart = null; return; }
  previewStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, point };
  try { previewFrame.setPointerCapture(event.pointerId); } catch {}
});
previewFrame.addEventListener('pointerup', async event => {
  if (!previewStart || event.pointerId !== previewStart.pointerId || !terminal()) return;
  const dx = event.clientX - previewStart.x; const dy = event.clientY - previewStart.y;
  const moved = Math.abs(dx) + Math.abs(dy) > 14;
  const point = moved ? previewStart.point : previewPoint(event.clientX, event.clientY);
  previewStart = null;
  if (!point) return;
  await previewInput({ type: moved ? 'scroll' : 'click', ...point, ...(moved ? { deltaX: Math.max(-2000, Math.min(2000, Math.round(-dx))), deltaY: Math.max(-2000, Math.min(2000, Math.round(-dy))) } : {}) });
});
previewFrame.addEventListener('pointercancel', () => { previewStart = null; });
previewFrame.addEventListener('wheel', async event => {
  event.preventDefault(); const point = previewPoint(event.clientX, event.clientY);
  if (!point) return;
  await previewInput({ type: 'scroll', ...point, deltaX: Math.max(-2000, Math.min(2000, Math.round(event.deltaX))), deltaY: Math.max(-2000, Math.min(2000, Math.round(event.deltaY))) });
}, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreview(); else { if (currentView === 'preview') startPreview(); scheduleReconnect(); } });
addEventListener('online', () => { if (connection) { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => { const pair = storedPairing(); if (pair) connect(pair); }, 0); } });
addEventListener('offline', () => { if (connection) setConnection(false, 'Offline'); });

const pairing = readPairing() || storedPairing();
if (pairing) { $('#device-description').textContent = `Paired as ${safeText(pairing.deviceId, 'device')}.`; connect(pairing); installServiceWorker(); $('#tabbar').hidden = false; navigate('projects'); }
else { showUnpaired(); }
