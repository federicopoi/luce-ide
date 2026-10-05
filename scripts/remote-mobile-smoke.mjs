import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mock = `
const state = {
  projects: [{id:'p1',name:'Luce',path:'/Users/me/Luce'}],
  terminals: [{id:'t1',projectId:'p1',provider:'codex',title:'Current task',status:'running',working:true,approvalsCapable:true,cols:80,rows:24}],
  accounts: [{id:'default',name:'Personal',provider:'codex',status:'signed-in'}],
  approvals: [{id:'a1',terminalId:'t1',provider:'codex',title:'Review command',summary:'npm test',status:'pending'}],
  remoteCapabilities: {previewControls:true,sessionControls:true}
};
window.__mobileState=state;
const remoteState=()=>{const value=structuredClone(state);if(window.__oldHost)delete value.remoteCapabilities;return value;};
export class PhoneConnection {
  constructor(options) { this.options=options; this.requests=[]; this.closed=false; (window.__connections ||= []).push(this); (window.__connectionEvents ||= []); window.__remote=this; }
  async connect() { this.statusCallback?.({connected:true}); window.__connectionEvents.push('open'); setTimeout(() => { if(!this.closed) { window.__connectionEvents.push('ready'); this.statusCallback?.({connected:true,ready:true}); this.events?.get('state')?.(remoteState()); } }, 0); }
  async request(method, params={}) {
    window.__connectionEvents.push('request:'+method);
    this.requests.push({method,params});
    if (method==='submit') throw new Error('Unsupported remote operation.');
    if (method==='state') {
      if(window.__exitBeforeEnter) { window.__exitBeforeEnter=false; state.terminals.find(terminal=>terminal.id==='t-exit-before-enter').status='exited'; }
      return remoteState();
    }
    if (method==='write' && window.__delayWrite) {
      window.__delayWrite=false;
      await new Promise(resolve => window.__releaseWrite=resolve);
      window.__writeFinished=true;
    }
    if (method==='terminalSnapshot') {
      const snapshot=structuredClone(window.__snapshot || {buffer:'$ npm test\\nPASS ready\\n',outputOffset:2,cols:80,rows:24});
      if(window.__delayNextSnapshot) { window.__delayNextSnapshot=false; await new Promise(resolve=>window.__releaseSnapshot=resolve); }
      return snapshot;
    }
    if (method==='preview') {
      if(window.__delayNextPreview) { window.__delayNextPreview=false; await new Promise(resolve=>window.__releasePreview=resolve); }
      return {jpeg:document.createElement('canvas').toDataURL('image/jpeg'),width:params.mode==='desktop'?1280:params.width||390,height:params.mode==='desktop'?800:params.height||700};
    }
    if (method==='previewInput' && window.__delayNextPreviewInput) { window.__delayNextPreviewInput=false; await new Promise(resolve=>window.__releasePreviewInput=resolve); }
    if(method==='rename'){state.terminals.find(t=>t.id===params.id).title=params.title;return {ok:true};}if(method==='autoApprove'){state.terminals.find(t=>t.id===params.id).autoApprove=params.enabled;return {ok:true};}
    if (method==='pushKey') return {publicKey:'test-key'};
    if (method==='create') {
      const created={id:'created-'+this.requests.length,projectId:params.projectId,provider:params.provider,accountId:params.accountId,title:'Replacement',status:'running',cols:80,rows:24};
      state.terminals.push(created);
      return created;
    }
    return {ok:true};
  }
  onStatus(callback) { this.statusCallback=callback; }
  onEvent(event, callback) { this.eventRegistrations ||= {}; this.eventRegistrations[event]=(this.eventRegistrations[event]||0)+1; this.events ||= new Map(); this.events.set(event, callback); }
  close() { this.closed=true; this.statusCallback?.({connected:false}); }
}
`;
const bundled = await build({
  absWorkingDir: root,
  entryPoints: ['src/mobile/mobile.js'],
  bundle: true,
  format: 'esm',
  write: false,
  loader:{'.svg':'text'},
  outfile: 'mobile.js',
  plugins: [{
    name: 'remote-protocol-fixture',
    setup(builder) {
      builder.onResolve({ filter: /remote-protocol\.mjs$/ }, () => ({ path: 'remote-protocol', namespace: 'mobile-smoke' }));
      builder.onLoad({ filter: /.*/, namespace: 'mobile-smoke' }, () => ({ contents: mock, loader: 'js' }));
    }
  }]
});
const outputs = new Map(bundled.outputFiles.map(file => [path.posix.basename(file.path), file.contents]));
const files = {
  '/': ['src/mobile/index.html', 'text/html'],
  '/index.html': ['src/mobile/index.html', 'text/html'],
  '/styles.css': ['src/mobile/styles.css', 'text/css'],
  '/mobile.js': [null, 'text/javascript'],
  '/mobile.css': [null, 'text/css'],
  '/manifest.webmanifest': ['src/mobile/manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['src/mobile/sw.js', 'text/javascript'],
  '/shared/remote-protocol.mjs': [null, 'text/javascript'],
  '/luce-mark.svg': ['assets/luce-mark.svg', 'image/svg+xml'],
  '/icon-256.png': ['assets/Luce.iconset/icon_256x256.png', 'image/png'],
  '/icon-512.png': ['assets/Luce.iconset/icon_512x512.png', 'image/png']
};
const server = createServer(async (req, res) => {
  const entry = files[new URL(req.url, 'http://localhost').pathname];
  if (!entry) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', entry[1]);
  if (entry[0]) res.end(await readFile(path.join(root, entry[0])));
  else if (new URL(req.url, 'http://localhost').pathname === '/shared/remote-protocol.mjs') res.end(mock);
  else res.end(outputs.get(new URL(req.url, 'http://localhost').pathname.slice(1)) || '');
});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  await context.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
  const page = await context.newPage();
  await mkdir(path.join(root, 'artifacts/mobile-polish'), { recursive: true });
  page.on('pageerror', error => console.error('PAGE ERROR:', error.stack));
  page.on('console', message => { if (message.type() === 'error') console.error('BROWSER:', message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/#pair=eyJob3N0SWQiOiJoMSIsImRldmljZUlkIjoiZDEiLCJrZXkiOiJrMSIsInJlbGF5VVJMIjoiaHR0cDovL2xvY2FsaG9zdDo5OTk5In0`);
  const installAssets = await page.evaluate(async () => ({
    manifest: await (await fetch('/manifest.webmanifest')).json(),
    touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
    addAccountButton: !!document.querySelector('#add-account-button')
  }));
  assert.ok(installAssets.manifest.icons.some(icon => icon.src === '/icon-512.png' && icon.type === 'image/png'));
  assert.equal(installAssets.touchIcon, '/icon-256.png');
  assert.equal(installAssets.addAccountButton, false);
  await page.getByRole('link', { name: 'Luce Remote projects' }).waitFor();
  await page.waitForFunction(() => location.hash === '', null, { timeout: 3000 });
  await page.waitForFunction(() => window.__connectionEvents.includes('request:state'));
  const connectionEvents = await page.evaluate(() => window.__connectionEvents);
  assert.ok(connectionEvents.indexOf('ready') < connectionEvents.indexOf('request:state'), 'state waits for encrypted connection readiness');
  const projectLayout = await page.evaluate(() => {
    const project = document.querySelector('.project-header');
    const session = document.querySelector('.session-row');
    const a = project.getBoundingClientRect(), b = session.getBoundingClientRect();
    return {project: {left:a.left,top:a.top,right:a.right,bottom:a.bottom}, session: {left:b.left,top:b.top,right:b.right,bottom:b.bottom}, radius:getComputedStyle(project.closest('.project-group')).borderRadius, projectIcon:!!project.querySelector('.project-icon svg'), tabIcons:[...document.querySelectorAll('#tabbar button svg')].length, tabLabelSize:getComputedStyle(document.querySelector('#tabbar button span')).fontSize};
  });
  assert.ok(projectLayout.project.bottom <= projectLayout.session.top, JSON.stringify(projectLayout));
  assert.ok(projectLayout.project.bottom-projectLayout.project.top <= 64, `project rows stay compact: ${JSON.stringify(projectLayout)}`);
  assert.ok(Number.parseFloat(projectLayout.radius) <= 5, `project rows use restrained corners: ${JSON.stringify(projectLayout)}`);
  assert.equal(projectLayout.projectIcon, true, 'project mark uses an outlined SVG icon');
  assert.equal(projectLayout.tabIcons, 5, 'every navigation item uses an outlined SVG icon');
  assert.equal(projectLayout.tabLabelSize, '11px', 'navigation labels stay readable without enlarging the bottom bar');
  await page.screenshot({path:path.join(root,'artifacts/mobile-polish/projects-390x844.png'),fullPage:true});
  assert.equal(await page.locator('.page-heading #mobile-project-view').count(),1,'Project view toggle stays beside Projects');
  await page.evaluate(()=>{window.__mobileState.projects.push({id:'design-project',name:'Agency',directory:'/Users/me/agency'});window.__remote.events.get('state')(structuredClone(window.__mobileState));});
  await page.getByRole('button',{name:'Toggle project view'}).click();
  assert.equal(await page.getByRole('tab',{name:'Agency',exact:true}).count(),1);
  await page.getByRole('tab',{name:'Agency',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-selected')),'true','Activating a project tab preserves keyboard focus');assert.equal(await page.locator('#project-list .session-row').count(),0,'Tabs show only selected project conversations');
  await page.getByRole('tab',{name:'Luce',exact:true}).click();assert.equal(await page.locator('#project-list .session-row').count(),1);
  await page.waitForTimeout(100);await page.screenshot({path:path.join(root,'artifacts/mobile-polish/project-tabs-390x844.png')});
  await page.getByRole('button',{name:'Toggle project view'}).click();
  await page.evaluate(()=>{window.__mobileState.projects=window.__mobileState.projects.filter(p=>p.id!=='design-project');window.__remote.events.get('state')(structuredClone(window.__mobileState));});

  assert.equal(await page.locator('.project-header .status-attention').count(),1,'Project shows pending approval indicator');
  await page.locator('.session-row').click();
  await page.getByRole('heading', { name: 'Current task' }).waitFor();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'terminalSnapshot'));
  const activeLayout = await page.evaluate(() => {
    const composer=document.querySelector('#composer').getBoundingClientRect();
    const tabbar=document.querySelector('#tabbar').getBoundingClientRect();
    return {composerBottom:composer.bottom,tabbarTop:tabbar.top,toolbarHeight:document.querySelector('#interrupt-button').getBoundingClientRect().height};
  });
  assert.ok(activeLayout.composerBottom <= activeLayout.tabbarTop, `composer stays above bottom navigation: ${JSON.stringify(activeLayout)}`);
  assert.ok(activeLayout.toolbarHeight >= 40, `terminal actions have comfortable touch targets: ${JSON.stringify(activeLayout)}`);
  await page.screenshot({path:path.join(root,'artifacts/mobile-polish/terminal-390x844.png'),fullPage:true});
  await page.evaluate(() => {
    window.__snapshot = {buffer:'RECOVERED OUTPUT\\n',outputOffset:220,cols:80,rows:24};
    window.__remote.events.get('terminal-data')({id:'t1',data:'missing terminal output',offset:220});
  });
  await page.waitForFunction(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length >= 2);
  await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('RECOVERED OUTPUT'));
  const recoveredSnapshotCount = await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length);
  await page.evaluate(() => {
    window.__snapshot={buffer:'SHOULD NOT APPLY',outputOffset:220,cols:80,rows:24};
    window.__remote.events.get('terminal-resync')({id:'other-terminal'});
  });
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length), recoveredSnapshotCount);
  await page.evaluate(() => {
    window.__snapshot={buffer:'RESYNCED OUTPUT',outputOffset:220,cols:80,rows:24};
    window.__remote.events.get('terminal-resync')({all:true});
  });
  await page.waitForFunction(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length > 2 && document.querySelector('.xterm-rows')?.textContent.includes('RESYNCED OUTPUT'));
  const beforeInflightResync = await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length);
  await page.evaluate(() => document.querySelector('[data-view="projects"]').click());
  await page.evaluate(() => {
    window.__snapshot={buffer:'PRE-RESYNC SNAPSHOT',outputOffset:220,cols:80,rows:24};
    window.__delayNextSnapshot=true;
    document.querySelector('[data-view="terminal"]').click();document.querySelector('#live-list [data-terminal-id="t1"]')?.click();
  });
  await page.waitForFunction(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length > 3);
  await page.evaluate(() => {
    window.__snapshot={buffer:'FINAL QUEUE SNAPSHOT',outputOffset:220,cols:80,rows:24};
    window.__remote.events.get('terminal-resync')({all:true});
    window.__releaseSnapshot?.();
  });
  await page.waitForFunction(count => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length >= count + 2 && document.querySelector('.xterm-rows')?.textContent.includes('FINAL QUEUE SNAPSHOT'), beforeInflightResync);
  await page.getByRole('button', { name: 'Send' }).waitFor();
  await page.getByRole('textbox', { name: 'Message terminal' }).fill('echo from phone');
  const sendRequestStart = await page.evaluate(() => window.__remote.requests.length);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'write' && r.params.id === 't1' && r.params.data === '\r'));
  const sendRequests = await page.evaluate(index => window.__remote.requests.slice(index), sendRequestStart);
  assert.deepEqual(sendRequests.map(request => [request.method, request.params.data]), [['submit','echo from phone'],['write','echo from phone'],['state',undefined],['write','\r']], 'legacy host fallback writes text, checks live state, then sends Enter separately');
  const enterRequestStart = await page.evaluate(() => window.__remote.requests.length);
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await page.waitForFunction(index => window.__remote.requests.slice(index).some(r => r.method === 'write' && r.params.data === '\r'), enterRequestStart);
  assert.deepEqual(await page.evaluate(index => window.__remote.requests.slice(index).map(r => [r.method,r.params.data]), enterRequestStart), [['write','\r']], 'Enter sends one carriage return without resending text');
  await page.getByRole('button', { name: 'Interrupt terminal' }).click();
  await page.getByRole('button', { name: 'Confirm interrupt' }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'interrupt'));
  await page.getByRole('button', { name: 'Approve Review command' }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'approve' && r.params.requestId === 'a1' && r.params.decision === 'accept'));
  const mutationCount = await page.evaluate(() => window.__connections.flatMap(connection => connection.requests).filter(r => ['submit','write','interrupt','approve'].includes(r.method)).length);
  await page.evaluate(() => {
    window.__delayNextSnapshot=true;
    window.__snapshot={buffer:'STALE SNAPSHOT',outputOffset:500,cols:80,rows:24};
    window.__remote.events.get('terminal-data')({id:'t1',data:'gap chunk',offset:500});
  });
  await page.waitForFunction(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length >= 4);
  await page.evaluate(() => { window.__snapshot={buffer:'FRESH SNAPSHOT',outputOffset:500,cols:80,rows:24}; });
  await page.evaluate(() => { window.__oldHost=true; window.__remote.statusCallback({connected:false}); });
  await page.waitForFunction(() => window.__connections.length === 2 && window.__remote.requests.some(r => r.method === 'state'));
  await page.waitForFunction(() => window.__remote.requests.filter(r => r.method === 'terminalSnapshot').length >= 1 && document.querySelector('.xterm-rows')?.textContent.includes('FRESH SNAPSHOT'));
  await page.evaluate(() => window.__releaseSnapshot?.());
  await page.waitForTimeout(30);
  assert.equal((await page.locator('.xterm-rows').textContent()).trim(), 'FRESH SNAPSHOT');
  assert.equal(await page.evaluate(() => window.__connections[0].closed), true);
  assert.deepEqual(await page.evaluate(() => window.__remote.eventRegistrations), {state:1,'terminal-data':1,'terminal-resync':1,approvals:1,notice:1});
  await page.evaluate(() => window.__connections[0].statusCallback({connected:false}));
  assert.equal(await page.evaluate(() => document.querySelector('#connection-label').textContent), 'Connected');
  assert.equal(await page.evaluate(() => window.__connections.flatMap(connection => connection.requests).filter(r => ['submit','write','interrupt','approve'].includes(r.method)).length), mutationCount);
  await page.evaluate(() => { window.__delayNextPreview=true; });
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'preview'));
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'preview' && r.params.mode === 'phone' && r.params.width >= 320 && r.params.height >= 320));
  assert.equal(await page.locator('#preview-compatibility').isVisible(), true, 'an older Mac connection that omits preview capability hides advanced controls');
  assert.equal(await page.locator('#preview-text').isDisabled(), true, 'reconnect clears the previous host capability');
  for (const viewport of [{width:320,height:780},{width:390,height:844},{width:768,height:900}]) {
    await page.setViewportSize(viewport);
    const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,fullscreenRight:document.querySelector('#fullscreen-button').getBoundingClientRect().right,innerWidth}));
    assert.ok(layout.scrollWidth<=viewport.width&&layout.fullscreenRight<=viewport.width,`preview controls fit ${viewport.width}px viewport: ${JSON.stringify(layout)}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => window.__remote.events.get('state')({...window.__mobileState,remoteCapabilities:{previewControls:true,submit:true}}));
  await page.evaluate(() => window.__remote.events.get('state')({...window.__mobileState,remoteCapabilities:{}}));
  assert.equal(await page.locator('#preview-compatibility').isVisible(), true, 'an older Mac shows restart guidance');
  assert.equal(await page.locator('#preview-text').isDisabled(), true, 'typing remains disabled until the Mac supports the control RPC');
  await page.evaluate(() => window.__remote.events.get('state')({...window.__mobileState,remoteCapabilities:{previewControls:true,submit:true}}));
  assert.equal(await page.locator('#preview-compatibility').isVisible(), false);
  assert.equal(await page.locator('#tabbar').isVisible(),false,'Website preview hides global navigation');
  assert.equal(await page.locator('.topbar').isVisible(),false,'Phone preview uses the full workspace');
  const frameHeight=(await page.locator('#preview-frame').boundingBox()).height;
  await page.getByRole('button',{name:'Toggle full screen'}).click();assert.ok((await page.locator('#preview-frame').boundingBox()).height>frameHeight,'Full screen expands the website without relying on browser fullscreen APIs');
  await page.getByRole('button',{name:'Toggle full screen'}).click();
  await page.screenshot({path:path.join(root,'artifacts/mobile-polish/preview-focused-390x844.png')});
  await page.setViewportSize({width:1024,height:900});assert.equal(await page.locator('#terminal-view').isVisible(),true,'Wide preview retains conversation on the left');const wide=await page.evaluate(()=>({chat:document.querySelector('#terminal-view').getBoundingClientRect().toJSON(),preview:document.querySelector('#preview-view').getBoundingClientRect().toJSON()}));assert.ok(wide.chat.right<=wide.preview.left,'Conversation and preview use separate columns');await page.getByRole('button',{name:'Toggle full screen'}).click();assert.equal(await page.locator('#terminal-view').isVisible(),false);await page.getByRole('button',{name:'Toggle full screen'}).click();await page.setViewportSize({width:390,height:844});
  await page.locator('#preview-tools summary').click();
  await page.getByRole('button', { name: 'Desktop', exact: true }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'preview' && r.params.mode === 'desktop'));
  await page.waitForFunction(() => document.querySelector('#preview-image').dataset.mode === 'desktop');
  assert.equal(await page.evaluate(() => document.querySelector('#preview-image').dataset.width), '1280');
  await page.evaluate(() => window.__releasePreview?.());
  await page.waitForTimeout(40);
  assert.equal(await page.locator('#preview-image').getAttribute('data-mode'), 'desktop', 'an older phone capture cannot replace the selected desktop viewport');
  await page.screenshot({path:path.join(root,'artifacts/mobile-polish/preview-design-390x844.png'),fullPage:true});
  await page.locator('#preview-frame').click({ position: { x: 190, y: 4 } });
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'previewInput').length), 0, 'taps in screenshot letterboxing are ignored');
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#preview-image').dataset.mode === 'phone' && document.querySelector('#preview-empty').hidden);
  const previewCenter=await page.locator('#preview-image').evaluate(image=>{const bounds=image.getBoundingClientRect(),frame=image.closest('#preview-frame').getBoundingClientRect();return{x:bounds.left+bounds.width/2-frame.left,y:bounds.top+bounds.height/2-frame.top};});
  await page.evaluate(() => { window.__delayNextPreviewInput=true; });
  await page.locator('#preview-frame').click({ position: previewCenter });
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'previewInput' && r.params.type === 'click' && r.params.x >= 0 && r.params.x <= 1 && r.params.y >= 0 && r.params.y <= 1));
  const clicksDuringPreview = await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'previewInput').length);
  await page.locator('#preview-frame').click({ position: previewCenter });
  assert.equal(await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'previewInput').length),clicksDuringPreview,'another tap waits while the previous website action updates its screenshot');
  await page.getByRole('button', { name: 'Desktop', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#preview-image').dataset.mode === 'desktop' && document.querySelector('#preview-empty').hidden, null, {timeout:5000});
  await page.evaluate(() => window.__releasePreviewInput?.());
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#preview-image').dataset.mode === 'phone' && document.querySelector('#preview-empty').hidden);
  await page.getByRole('textbox', { name: 'Text for the focused website field' }).fill('text for website');
  await page.getByRole('button', { name: 'Insert text' }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'previewInput' && r.params.type === 'text' && r.params.text === 'text for website' && r.params.mode === 'phone' && r.params.width >= 320));
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await page.getByRole('button', { name: 'Website back', exact: true }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'previewInput' && r.params.type === 'key' && r.params.key === 'Enter') && window.__remote.requests.some(r => r.method === 'previewInput' && r.params.type === 'navigate' && r.params.action === 'back'));
  await page.evaluate(() => document.querySelector('[data-view="create"]').click());
  assert.equal(await page.locator('#create-providers [role=radio]').count(),3);assert.equal(await page.locator('#create-providers svg').count(),3);await page.screenshot({path:path.join(root,'artifacts/mobile-polish/new-conversation-390x844.png')});
  await page.getByRole('radio',{name:'Claude Code',exact:true}).click();assert.equal(await page.locator('#create-provider').inputValue(),'claude');assert.equal(await page.locator('#account-field').isVisible(),false);await page.getByRole('radio',{name:'Codex',exact:true}).click();
  await page.getByRole('button', { name: 'Create terminal' }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'create' && r.params.projectId === 'p1' && r.params.provider === 'codex' && r.params.accountId === 'default'));
  await page.evaluate(() => document.querySelector('[data-view="settings"]').click());
  await page.getByRole('button', { name: 'Home screen instructions' }).waitFor();await page.screenshot({path:path.join(root,'artifacts/mobile-polish/settings-design-390x844.png')});
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.ready));
  assert.equal(sw, true);
  await page.evaluate(() => document.querySelector('[data-view="accounts"]').click());
  await page.getByText('Add accounts and sign in on your Mac.', { exact: false }).waitFor();await page.screenshot({path:path.join(root,'artifacts/mobile-polish/accounts-design-390x844.png')});
  const writesBeforeRecovery = await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'write').length);
  await page.evaluate(() => {
    document.querySelector('#terminal-message').value='unsent phone draft';
    window.__mobileState.accounts.push({id:'work',name:'Work',provider:'codex',status:'signed-in'});
    window.__mobileState.terminals.push({id:'t-exited',projectId:'p1',provider:'codex',accountId:'work',title:'Finished task',status:'exited',exitCode:1,cols:80,rows:50,previewAvailable:false});
    window.__snapshot={buffer:'ERROR --no-daemon cannot be used with --remote'+String.fromCharCode(13,10),outputOffset:51,cols:80,rows:50};
    window.__remote.events.get('state')(structuredClone(window.__mobileState));
    document.querySelector('[data-view="projects"]').click();
  });
  await page.locator('.ended-sessions summary').click();await page.getByRole('button', { name: /Finished task/ }).click();
  await page.getByRole('button', { name: 'Start another terminal' }).waitFor();
  assert.match(await page.locator('#terminal-exit-reason').textContent(), /exit code 1/i);
  await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('ERROR --no-daemon cannot be used with --remote'));
  const exitedOutput = await page.locator('.xterm-rows').textContent();
  assert.match(exitedOutput, /ERROR --no-daemon cannot be used with --remote/i, 'startup failure output remains visible after exit');
  assert.equal(await page.locator('#terminal-message').isDisabled(), true);
  assert.equal(await page.locator('#send-button').isDisabled(), true);
  assert.equal(await page.locator('#interrupt-button').isDisabled(), true);
  assert.equal(await page.locator('#clear-button').isDisabled(), true);
  assert.equal(await page.locator('#close-button').isDisabled(), false, 'Close remains available to dismiss an exited terminal');
  assert.equal(await page.locator('#preview-button').isDisabled(), true);
  assert.equal(await page.locator('#paste-button').isDisabled(), true);
  const terminalScroll = await page.locator('#terminal-output').evaluate(node => ({top:node.scrollTop, firstLineTop:node.querySelector('.xterm-rows')?.getBoundingClientRect().top, outputTop:node.getBoundingClientRect().top}));
  assert.equal(terminalScroll.top, 0, `short exit output starts at the top even for a tall remote PTY: ${JSON.stringify(terminalScroll)}`);
  assert.ok(terminalScroll.firstLineTop >= terminalScroll.outputTop, `startup error is not scrolled out of view: ${JSON.stringify(terminalScroll)}`);
  await page.locator('#toast').evaluate(node => { node.hidden = true; });
  await page.screenshot({path:path.join(root,'artifacts/mobile-polish/exited-terminal-390x844.png'),fullPage:true});
  const createCountBeforeRecovery = await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'create').length);
  await page.getByRole('button', { name: 'Start another terminal' }).click();
  assert.deepEqual(await page.evaluate(() => ({project:document.querySelector('#create-project').value,provider:document.querySelector('#create-provider').value,account:document.querySelector('#create-account').value})), {project:'p1',provider:'codex',account:'work'});
  await page.evaluate(() => window.__remote.events.get('state')(structuredClone(window.__mobileState)));
  assert.deepEqual(await page.evaluate(() => ({project:document.querySelector('#create-project').value,provider:document.querySelector('#create-provider').value,account:document.querySelector('#create-account').value})), {project:'p1',provider:'codex',account:'work'}, 'state refresh preserves recovery selections');
  await page.evaluate(() => {
    window.__mobileState.accounts.find(account=>account.id==='work').status='signed-out';
    window.__remote.events.get('state')(structuredClone(window.__mobileState));
  });
  assert.equal(await page.locator('#create-account').inputValue(), 'default', 'an unavailable selected account falls back to an enabled account');
  await page.evaluate(() => {
    window.__mobileState.accounts.find(account=>account.id==='work').status='signed-in';
    window.__remote.events.get('state')(structuredClone(window.__mobileState));
  });
  await page.locator('#create-account').selectOption('work');
  assert.equal(await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'create').length), createCountBeforeRecovery, 'opening recovery form does not create a terminal');
  await page.getByRole('button', { name: 'Create terminal' }).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method === 'create' && r.params.projectId === 'p1' && r.params.provider === 'codex' && r.params.accountId === 'work'));
  await page.getByRole('heading', {name:'Replacement'}).waitFor();
  assert.equal(await page.locator('#terminal-message').inputValue(), '', 'a replacement for another conversation does not inherit unrelated drafts');
  assert.equal(await page.evaluate(() => window.__remote.requests.filter(r => r.method === 'write').length), writesBeforeRecovery, 'recovery does not resend the unsent draft');
  await page.evaluate(() => {
    window.__mobileState.terminals.push({id:'t-exit-before-enter',projectId:'p1',provider:'shell',title:'Exit before Enter',status:'running',cols:80,rows:24});
    window.__remote.events.get('state')(structuredClone(window.__mobileState));
    document.querySelector('[data-view="projects"]').click();
  });
  await page.getByRole('button', {name:/Exit before Enter/}).click();
  await page.locator('#terminal-message').fill('do not submit after exit');
  await page.evaluate(() => { window.__exitBeforeEnter=true; });
  const exitSendStart = await page.evaluate(() => window.__remote.requests.length);
  await page.getByRole('button', {name:'Send'}).click();
  await page.waitForFunction(() => window.__mobileState.terminals.find(terminal=>terminal.id==='t-exit-before-enter').status==='exited');
  assert.equal(await page.locator('#terminal-message').inputValue(), 'do not submit after exit', 'draft remains after host reports the terminal exited');
  assert.equal(await page.evaluate(index => window.__remote.requests.slice(index).some(request=>request.method==='write'&&request.params.id==='t-exit-before-enter'&&request.params.data==='\r'), exitSendStart), false, 'legacy fallback must not send Enter after the terminal exits');
  await page.getByRole('button', {name:/Back to terminals/}).click();
  await page.setViewportSize({width:320,height:780});
  const narrowPhone = await page.locator('main').evaluate(node => ({width:node.getBoundingClientRect().width, overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(narrowPhone.overflow, false, `narrow phone layout has no horizontal overflow: ${JSON.stringify(narrowPhone)}`);
  await page.setViewportSize({width:768,height:900});
  const desktopPhone = await page.locator('main').evaluate(node => ({width:node.getBoundingClientRect().width, overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(desktopPhone.overflow, false, `tablet layout has no horizontal overflow: ${JSON.stringify(desktopPhone)}`);
  await page.evaluate(() => {
    window.__mobileState.terminals.push({id:'t-late-write',projectId:'p1',provider:'shell',title:'Late write',status:'running',cols:80,rows:24});
    window.__remote.events.get('state')(structuredClone(window.__mobileState));
    document.querySelector('[data-view="projects"]').click();
  });
  await page.getByRole('button', {name:/Late write/}).click();
  await page.getByRole('heading', {name:'Late write'}).waitFor();
  await page.locator('#terminal-message').fill('sent before exit');
  await page.evaluate(() => { window.__delayWrite=true; window.__writeFinished=false; });
  await page.getByRole('button', {name:'Send'}).click();
  await page.waitForFunction(() => window.__remote.requests.some(r => r.method==='write' && r.params.id==='t-late-write'));
  await page.locator('#terminal-message').fill('draft typed while sending');
  await page.evaluate(() => {
    const active=window.__mobileState.terminals.find(item=>item.id==='t-late-write');
    active.status='exited'; active.exitCode=0;
    window.__remote.events.get('state')(structuredClone(window.__mobileState));
    window.__releaseWrite?.();
  });
  await page.waitForFunction(() => window.__writeFinished);
  await page.waitForTimeout(20);
  assert.equal(await page.locator('#send-button').isDisabled(), true, 'an in-flight send cannot re-enable the composer after exit');
  assert.equal(await page.locator('#terminal-message').inputValue(), 'draft typed while sending', 'an in-flight send keeps text entered after the send began');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{window.__oldHost=false;window.__mobileState.approvals=[];window.__snapshot={buffer:'OpenAI Codex\nWorking on the current project.\n',outputOffset:58,cols:80,rows:24};document.querySelector('#toast').hidden=true;window.__mobileState.remoteCapabilities={previewControls:true,sessionControls:true};window.__mobileState.projects.push({id:'p2',name:'Client work',directory:'/Users/me/client'});window.__mobileState.terminals=[{id:'m1',projectId:'p1',provider:'codex',accountId:'default',title:'guitar',status:'running',working:true,approvalsCapable:true,diskBytes:2048},{id:'m2',projectId:'p1',provider:'codex',title:'Other task',status:'running',working:true,approvalsCapable:true},{id:'m3',projectId:'p1',provider:'claude',title:'Design questions',status:'running',activity:'attention',approvalsCapable:true},{id:'m4',projectId:'p1',provider:'codex',title:'Finished page',status:'running',activity:'complete'},{id:'m5',projectId:'p2',provider:'shell',title:'Old shell',status:'exited'}];window.__remote.events.get('state')(structuredClone(window.__mobileState));document.querySelector('[data-view="terminal"]').click();});
  await page.getByRole('heading',{name:'Live terminals'}).waitFor();
  assert.match(await page.locator('#live-summary').textContent(),/4 open · 2 working · 1 need input/);
  await page.locator('[data-filter="working"]').click();assert.equal(await page.locator('#live-list .session-row').count(),2);
  await page.locator('[data-filter="attention"]').click();assert.equal(await page.locator('#live-list .session-row').count(),1);
  await page.locator('[data-filter="open"]').click();await page.locator('#live-search').fill('guitar');assert.equal(await page.locator('#live-list .session-row').count(),1);await page.locator('#live-search').fill('');
  await page.screenshot({path:path.join(root,'artifacts/mobile-polish/live-workspace-390x844.png'),fullPage:true});
  await page.locator('#live-list [data-terminal-id="m1"]').click();await page.locator('#terminal-message').fill('guitar draft');await page.locator('#terminal-switcher').selectOption('m2');assert.equal(await page.locator('#terminal-message').inputValue(),'');await page.locator('#terminal-message').fill('other draft');await page.locator('#terminal-switcher').selectOption('m1');assert.equal(await page.locator('#terminal-message').inputValue(),'guitar draft');
  await page.getByRole('button',{name:'Rename conversation',exact:true}).click();await page.locator('#rename-input').fill('guitar solo');await page.locator('#rename-form button[type=submit]').click();await page.getByRole('heading',{name:'guitar solo',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__mobileState.terminals.find(t=>t.id==='m2').title),'Other task');
  await page.getByRole('switch',{name:'Auto approve permission requests'}).click();await page.waitForFunction(()=>document.querySelector('#terminal-auto').getAttribute('aria-checked')==='true');
  await page.locator('#toast').evaluate(node=>node.hidden=true);await page.screenshot({path:path.join(root,'artifacts/mobile-polish/session-controls-390x844.png'),fullPage:true});
  await page.locator('[data-view="projects"]').click();assert.equal(await page.locator('[data-project-id="p1"] .status-working small').textContent(),'2');assert.equal(await page.locator('[data-project-id="p1"] .status-attention small').textContent(),'2');assert.equal(await page.locator('[data-project-id="p1"] .open-count').textContent(),'4');await page.locator('#project-search').fill('other task');assert.equal(await page.locator('#project-list .session-row').count(),1);await page.locator('#project-search').fill('');
  await page.locator('#toast').evaluate(node=>node.hidden=true);await page.screenshot({path:path.join(root,'artifacts/mobile-polish/project-status-390x844.png'),fullPage:true});
  await page.locator('[data-project-id="p1"]').click();assert.equal(await page.locator('[data-project-id="p1"]').getAttribute('aria-expanded'),'false');await page.evaluate(()=>window.__remote.events.get('state')(structuredClone(window.__mobileState)));assert.equal(await page.locator('[data-project-id="p1"]').getAttribute('aria-expanded'),'false');await page.locator('[data-project-id="p1"]').click();
  await page.locator('#project-list [data-terminal-id="m1"]').click();await page.getByRole('button',{name:'Preview',exact:true}).click();await page.evaluate(()=>{window.__mobileState.terminals=window.__mobileState.terminals.filter(t=>t.id!=='m1');window.__remote.events.get('state')(structuredClone(window.__mobileState));});await page.getByRole('heading',{name:'Live terminals'}).waitFor();assert.equal(await page.locator('#preview-view').isVisible(),false,'Removing preview session returns to overview');
  await page.setViewportSize({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:768,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>window.__remote.statusCallback({connected:false}));
  await page.locator('[data-view="projects"]').click();assert.equal(await page.locator('.project-new').first().isDisabled(),true);
  await page.locator('[data-view="create"]').click();assert.equal(await page.locator('#create-form button[type="submit"]').isDisabled(),true);
  await context.close();
  console.log('PASS: pair scrub, terminal send/interrupt, exact approval, preview input, provider/account creation, and install guidance');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
