const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const source=fs.readFileSync(require.resolve('../src/main/main.cjs'),'utf8');
function harness(){
 const windows=[],events=new EventEmitter();let ready,resolveEnvironment,updates=0;
 class Window extends EventEmitter{
  constructor(){super();windows.push(this);this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.visible=true;}
  show(){this.visible=true;}focus(){}hide(){this.visible=false;}isDestroyed(){return false;}loadFile(){}
 }
 class Service extends EventEmitter{async start(){}async refreshAll(){}async restore(){}snapshot(){return {cliAutoUpdates:true};}list(){return [];}async run(){updates++;}}
 const context=vm.createContext({
  window:undefined,store:undefined,terminals:undefined,environment:undefined,preview:undefined,workspaceShutdown:false,workspaceRestoring:true,quitting:false,
  app:{on:events.on.bind(events),getPath:()=>'/fixture',whenReady:()=>({then(fn){ready=fn;return {catch(){}};}})},
  BrowserWindow:Window,Preview:class{hide(){}destroy(){}},path:require('node:path'),__dirname:'/fixture',process:{env:{}},
  Store:Service,WorkspaceResume:Service,CompletionSound:Service,ProviderUpdates:Service,Accounts:Service,GitHubAccounts:Service,AccountService:Service,ApprovalService:Service,TerminalManager:Service,
  protocol:{handle(){}},resolveEnvironment:()=>new Promise(resolve=>{resolveEnvironment=resolve;}),
  changed(){},send(){},registerIPC(){},initializeRemote:async()=>{},menu(){},refresh:async()=>{},restoreSavedTerminal(){},scanServers:async()=>{},setInterval:()=>({unref(){}}),
 });
 vm.runInContext(source.slice(source.indexOf('function createWindow(){'),source.indexOf('function menu(){')),context);
 vm.runInContext(source.slice(source.indexOf("app.on('activate'"),source.indexOf('\n',source.indexOf('app.whenReady().then'))),context);
 return {context,windows,events,start:()=>ready(),resolve:()=>resolveEnvironment({env:{},executables:{}}),updates:()=>updates};
}
test('activation during startup does not create an orphan window; close and reopen reuse the main window',async()=>{
 const h=harness(),starting=h.start();h.events.emit('activate');
 const premature=h.windows.length;h.resolve();await starting;
 assert.equal(premature,0,'wait until services and IPC are initialized');
 assert.equal(h.windows.length,1);h.context.createWindow();assert.equal(h.windows.length,1,'creation is idempotent');
 const win=h.windows[0];win.emit('close',{preventDefault(){}});assert.equal(win.visible,false);
 h.events.emit('activate');assert.equal(win.visible,true);assert.equal(h.windows.length,1);
});
test('startup never runs provider updates even with a previously enabled preference',async()=>{
 const h=harness(),starting=h.start();h.resolve();await starting;assert.equal(h.updates(),0);
});
