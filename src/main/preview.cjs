const {WebContentsView}=require('electron');
const {previewURL}=require('./validation.cjs');
class Preview {
 constructor(window,onEvent){this.window=window;this.onEvent=onEvent;this.view=null;this.attached=false;this.projectId=null;this.url='';}
 ensure(projectId){
  if(this.view&&this.projectId===projectId)return;
  if(this.view){this.hide();this.view.webContents.close();}
  this.projectId=projectId;this.url='';
  this.view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:`persist:orbit-preview-${projectId}`}});
  const contents=this.view.webContents;contents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));contents.session.setPermissionCheckHandler(()=>false);
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  for(const event of ['will-navigate','will-frame-navigate','will-redirect'])contents.on(event,(e,url)=>{try{previewURL(typeof url==='string'?url:e.url);}catch{e.preventDefault();}});
  contents.on('did-start-loading',()=>this.onEvent({status:'loading'}));
  contents.on('did-stop-loading',()=>this.onEvent({status:'ready',url:contents.getURL()}));
  contents.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3)this.onEvent({status:'error',url,message:`Could not load this page. Make sure your dev server is running. (${description})`});});
 }
 async show({projectId,url,bounds}){const valid=previewURL(url);this.ensure(projectId);this.setBounds(bounds);if(!this.attached){this.window.contentView.addChildView(this.view);this.attached=true;}if(this.url!==valid){this.url=valid;try{await this.view.webContents.loadURL(valid);}catch{}}return {url:valid};}
 setBounds(bounds){if(!this.view)return;const size=this.window.getContentBounds();let {x,y,width,height}=bounds||{};if(![x,y,width,height].every(Number.isFinite))throw Error('Invalid preview bounds.');x=Math.max(0,Math.min(Math.round(x),size.width));y=Math.max(0,Math.min(Math.round(y),size.height));width=Math.max(0,Math.min(Math.round(width),size.width-x));height=Math.max(0,Math.min(Math.round(height),size.height-y));this.view.setBounds({x,y,width,height});}
 hide(){if(this.attached&&this.view&&!this.window.isDestroyed()){this.window.contentView.removeChildView(this.view);this.attached=false;}}
 reload(){this.view?.webContents.reload();}
 destroy(){this.hide();if(this.view&&!this.view.webContents.isDestroyed())this.view.webContents.close();this.view=null;}
}
module.exports={Preview};
