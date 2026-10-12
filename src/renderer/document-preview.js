import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import {renderAsync} from 'docx-preview';
GlobalWorkerOptions.workerSrc='./pdf.worker.mjs';
export function mountDocument(result,host,api){
 let disposed=false,task=null,document=null,renderTask=null;
 const stage=window.document.createElement('div');stage.className='document-preview';host.append(stage);
 const status=window.document.createElement('p');status.className='document-status';status.textContent='Opening document…';stage.append(status);
 const ready=(async()=>{
  try{
   if(result.kind==='docx'){
    const body=window.document.createElement('div');body.className='word-pages';
    const shadow=body.attachShadow({mode:'open'});
    await renderAsync(result.data,shadow,shadow,{className:'luce-word',useBase64URL:true,renderAltChunks:false,renderComments:false});
    if(disposed)return;const style=window.document.createElement('style');style.textContent='.luce-word-wrapper{padding:0!important;background:transparent!important;}section.luce-word{color:#111;background:white;box-shadow:0 4px 24px #0005;margin:0 auto 24px;}';shadow.append(style);status.remove();stage.append(body);
    shadow.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});
    return;
   }
   class LocalPDFData{fetch({kind,filename}){return api.pdfPreviewResource(kind,filename);}}
   task=getDocument({data:result.data,isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,BinaryDataFactory:LocalPDFData,cMapUrl:'../node_modules/pdfjs-dist/cmaps/',standardFontDataUrl:'../node_modules/pdfjs-dist/standard_fonts/',wasmUrl:'../node_modules/pdfjs-dist/wasm/'});document=await task.promise;if(disposed)return;
   const controls=window.document.createElement('div');controls.className='document-controls';
   const previous=window.document.createElement('button'),next=window.document.createElement('button'),label=window.document.createElement('span'),zoom=window.document.createElement('select');
   previous.textContent='Previous';previous.setAttribute('aria-label','Previous PDF page');next.textContent='Next';next.setAttribute('aria-label','Next PDF page');label.setAttribute('aria-live','polite');zoom.setAttribute('aria-label','PDF zoom');
   for(const [value,text] of [['fit','Fit width'],['1','100%'],['1.5','150%'],['2','200%']]){const option=window.document.createElement('option');option.value=value;option.textContent=text;zoom.append(option);}
   controls.append(previous,label,next,zoom);const pageHost=window.document.createElement('div');pageHost.className='pdf-page-host';status.remove();stage.append(controls,pageHost);let number=1,revision=0;
   async function show(){const version=++revision;renderTask?.cancel();previous.disabled=number===1;next.disabled=number===document.numPages;label.textContent=`Page ${number} of ${document.numPages}`;const page=await document.getPage(number);if(disposed||version!==revision)return;const base=page.getViewport({scale:1});const scale=zoom.value==='fit'?Math.min(2,Math.max(.25,(host.clientWidth-64)/base.width)):Number(zoom.value);const viewport=page.getViewport({scale}),canvas=window.document.createElement('canvas'),ratio=Math.min(2,devicePixelRatio||1);canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;canvas.setAttribute('aria-label',`PDF page ${number}`);pageHost.replaceChildren(canvas);renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});try{await renderTask.promise;}catch(error){if(error.name!=='RenderingCancelledException')throw error;}}
   const refresh=()=>show().catch(error=>{if(!disposed){status.textContent='Could not render this page. Try another page or open the PDF in its app.';pageHost.replaceChildren(status);}});previous.onclick=()=>{number--;refresh();};next.onclick=()=>{number++;refresh();};zoom.onchange=refresh;await show();
  }catch(error){if(!disposed){stage.replaceChildren(status);status.textContent='This document could not be previewed. Use Open for editing to open it in its app.';}}
 })();
 return ()=>{disposed=true;renderTask?.cancel();task?.destroy().catch(()=>{});};
}
