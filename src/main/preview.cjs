const {WebContentsView}=require('electron');
const {previewURL}=require('./validation.cjs');
class Preview {
 constructor(window,onEvent){this.window=window;this.onEvent=onEvent;this.view=null;this.attached=false;this.projectId=null;this.url='';this.status='idle';this.lastBounds=null;}
 ensure(projectId){
  if(this.view&&this.projectId===projectId)return;
  if(this.view){this.hide();this.view.webContents.close();}
  this.projectId=projectId;this.url='';this.status='idle';
  this.view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:`persist:orbit-preview-${projectId}`}});
  const contents=this.view.webContents;contents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));contents.session.setPermissionCheckHandler(()=>false);
  contents.setWindowOpenHandler(({url})=>{let destination;try{destination=previewURL(url);}catch{return {action:'deny'};}queueMicrotask(()=>{if(contents.isDestroyed()||this.view?.webContents!==contents||!this.attached)return;this.url=destination;contents.loadURL(destination).catch(()=>{});});return {action:'deny'};});
  for(const event of ['will-navigate','will-frame-navigate','will-redirect'])contents.on(event,(e,url)=>{try{previewURL(typeof url==='string'?url:e.url);}catch{e.preventDefault();}});
  const notify=event=>this.onEvent({...event,projectId});
  contents.on('did-start-loading',()=>{this.status='loading';notify({status:'loading'});});
  contents.on('did-stop-loading',()=>{if(this.status==='error')return;this.status='ready';this.url=contents.getURL();notify({status:'ready',url:this.url});});
  contents.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3){this.status='error';notify({status:'error',url,message:`Could not load this page. Make sure your dev server is running. (${description})`});}});
 }
 async show({projectId,url,bounds},force=false){const valid=previewURL(url);this.ensure(projectId);this.setBounds(bounds);if(!this.attached){this.window.contentView.addChildView(this.view);this.attached=true;}if(force||this.url!==valid||this.status==='error'){this.url=valid;this.status='loading';try{await this.view.webContents.loadURL(valid);}catch{this.status='error';}}return {url:valid};}
 setBounds(bounds){if(!this.view)return;const size=this.window.getContentBounds();let {x,y,width,height}=bounds||{};if(![x,y,width,height].every(Number.isFinite))throw Error('Invalid preview bounds.');x=Math.max(0,Math.min(Math.round(x),size.width));y=Math.max(0,Math.min(Math.round(y),size.height));width=Math.max(0,Math.min(Math.round(width),size.width-x));height=Math.max(0,Math.min(Math.round(height),size.height-y));this.lastBounds={x,y,width,height};this.view.setBounds(this.lastBounds);}
 hide(){if(this.attached&&this.view&&!this.window.isDestroyed()){this.window.contentView.removeChildView(this.view);this.attached=false;}}
 reload(){if(this.view&&this.url)return this.show({projectId:this.projectId,url:this.url,bounds:this.lastBounds},true);}
 destroy(){this.hide();if(this.view&&!this.view.webContents.isDestroyed())this.view.webContents.close();this.view=null;}
}
module.exports={Preview};
