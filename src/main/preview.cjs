const {WebContentsView}=require('electron');
const {validateDevice}=require('../shared/preview-device.cjs');
const {previewURL}=require('./validation.cjs');
class PreviewPage {
 constructor(window,onEvent){this.window=window;this.onEvent=onEvent;this.view=null;this.attached=false;this.projectId=null;this.url='';this.status='idle';this.lastBounds=null;}
 ensure(projectId){
  if(this.view&&this.projectId===projectId)return;
  if(this.view){this.hide();this.view.webContents.close();}
  this.projectId=projectId;this.url='';this.status='idle';this.device=null;this.emulationReady=false;this.emulating=false;
  this.view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:`persist:orbit-preview-${projectId}`}});
  const contents=this.view.webContents;contents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));contents.session.setPermissionCheckHandler(()=>false);
  contents.setWindowOpenHandler(({url})=>{let destination;try{destination=previewURL(url);}catch{return {action:'deny'};}this.onEvent({status:'new-tab',projectId,url:destination});return {action:'deny'};});
  for(const event of ['will-navigate','will-frame-navigate','will-redirect'])contents.on(event,(e,url)=>{try{previewURL(typeof url==='string'?url:e.url);}catch{e.preventDefault();}});
  const notify=event=>this.onEvent({...event,projectId});
  const history=()=>{this.url=contents.getURL();notify({status:'history',url:this.url,...this.historyState()});};
  contents.on('did-navigate',history);
  contents.on('did-navigate-in-page',(_event,_url,isMainFrame)=>{if(isMainFrame)history();});
  contents.on('page-title-updated',(_e,title)=>notify({status:'title',title}));
  contents.on('did-finish-load',()=>{if(this.view?.webContents!==contents)return;this.emulationReady=true;this.applyDevice();});
  contents.on('did-start-loading',()=>{this.status='loading';notify({status:'loading'});});
  contents.on('did-stop-loading',()=>{if(this.status==='error')return;this.status='ready';this.url=contents.getURL();notify({status:'ready',url:this.url,...this.historyState()});});
  contents.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3){this.status='error';notify({status:'error',url,message:`Could not load this page. Make sure your dev server is running. (${description})`});}});
 }
 async show({projectId,url,bounds},force=false){const valid=previewURL(url);this.ensure(projectId);this.setBounds(bounds);if(!this.attached){this.window.contentView.addChildView(this.view);this.attached=true;}if(force||this.url!==valid||this.status==='error'){this.url=valid;this.status='loading';try{if(force)this.view.webContents.reloadIgnoringCache();else await this.view.webContents.loadURL(valid);}catch{this.status='error';}}return {url:this.url||valid,...this.historyState()};}
 setBounds(bounds){if(!this.view)return;const device=validateDevice(bounds?.device);const size=this.window.getContentBounds();let {x,y,width,height}=bounds||{};if(![x,y,width,height].every(Number.isFinite))throw Error('Invalid preview bounds.');x=Math.max(0,Math.min(Math.round(x),size.width));y=Math.max(0,Math.min(Math.round(y),size.height));width=Math.max(0,Math.min(Math.round(width),size.width-x));height=Math.max(0,Math.min(Math.round(height),size.height-y));this.lastBounds={x,y,width,height};this.view.setBounds(this.lastBounds);this.device=device;
 this.lastBounds={...this.lastBounds,...(device?{device}:{})};this.applyDevice();}
 applyDevice(){
  if(!this.emulationReady||!this.view||this.view.webContents.isDestroyed())return;
  const device=this.device,{width,height}=this.lastBounds;
  if(device){const scale=Math.max(.01,Math.min(width/device.width,height/device.height));this.view.webContents.enableDeviceEmulation({screenPosition:'mobile',screenSize:device,viewPosition:{x:0,y:0},deviceScaleFactor:0,viewSize:device,scale});this.view.setBorderRadius(Math.round(18*scale));this.emulating=true;}
  else if(this.emulating){this.view.webContents.disableDeviceEmulation();this.view.setBorderRadius(0);this.emulating=false;}
 }

 historyState(){const history=this.view?.webContents.navigationHistory;return {canGoBack:!!history?.canGoBack(),canGoForward:!!history?.canGoForward()};}
 navigate(direction){const history=this.view?.webContents.navigationHistory;if(!history)return;const available=direction==='back'?history.canGoBack():history.canGoForward();if(!available)return;if(!this.attached){this.window.contentView.addChildView(this.view);this.attached=true;}if(direction==='back')history.goBack();else history.goForward();}
 hide(){if(this.attached&&this.view&&!this.window.isDestroyed()){this.window.contentView.removeChildView(this.view);this.attached=false;}}
 reload(){if(this.view&&this.url)return this.show({projectId:this.projectId,url:this.status==='error'?this.url:this.view.webContents.getURL()||this.url,bounds:this.lastBounds},true);}
 destroy(){this.hide();if(this.view&&!this.view.webContents.isDestroyed())this.view.webContents.close();this.view=null;}
}
// Pages live for this app session; hiding a preview retains its tabs.
class Preview {
 constructor(window,onEvent){this.window=window;this.onEvent=onEvent;this.pages=new Map();this.active=null;}
 key({projectId,sessionId,tabId}){return JSON.stringify([projectId,sessionId||null,tabId||'default']);}
 async show(options,force=false){const key=this.key(options);let page=this.pages.get(key);if(!page){page=new PreviewPage(this.window,event=>this.onEvent({...event,sessionId:options.sessionId,tabId:options.tabId}));this.pages.set(key,page);}if(this.active!==page){this.active?.hide();this.active=page;}return page.show(options,force);}
 hide(){this.active?.hide();}
 setBounds(bounds){this.active?.setBounds(bounds);}
 reload(){return this.active?.reload();}
 navigate(direction){if(!['back','forward'].includes(direction))throw Error('Invalid navigation direction.');return this.active?.navigate(direction);}
 closeTab(options){const key=this.key(options),page=this.pages.get(key);if(!page)return;page.destroy();this.pages.delete(key);if(this.active===page)this.active=null;}
 destroy(){for(const page of this.pages.values())page.destroy();this.pages.clear();this.active=null;}
}
module.exports={Preview};
