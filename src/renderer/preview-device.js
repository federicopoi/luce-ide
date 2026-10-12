import {DEVICE_PRESETS,deviceLayout,validateDevice} from '../shared/preview-device.cjs';
export function createPreviewDevice({icon,onChange}){
 const $=id=>document.getElementById(id),key='luce-preview-device';
 let state={enabled:false,preset:'iphone-16',width:393,height:852};
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved){const device=validateDevice(saved);state={...device,enabled:saved.enabled===true,preset:DEVICE_PRESETS.some(p=>p.id===saved.preset)?saved.preset:'responsive'};}}catch{}
 const toggle=$('preview-device-toggle'),bar=$('preview-device-toolbar'),select=$('preview-device-preset'),width=$('preview-device-width'),height=$('preview-device-height'),frame=$('preview-device-frame');
 toggle.innerHTML=icon('phone');
 select.innerHTML=DEVICE_PRESETS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
 function render(){
  toggle.setAttribute('aria-pressed',String(state.enabled));toggle.title=state.enabled?'Switch to desktop preview':'Switch to mobile preview';
  bar.hidden=!state.enabled;frame.hidden=!state.enabled;$('browser-surface').classList.toggle('device-mode',state.enabled);
  select.value=state.preset;width.value=state.width;height.value=state.height;
 }
 function change(){render();try{localStorage.setItem(key,JSON.stringify(state));}catch{}onChange();}
 toggle.onclick=()=>{state.enabled=!state.enabled;change();};
 select.onchange=()=>{const preset=DEVICE_PRESETS.find(p=>p.id===select.value);if(preset){state={...state,preset:preset.id,width:preset.width,height:preset.height};change();}};
 function dimensions(){
  if(!width.checkValidity()||!height.checkValidity()){width.reportValidity();height.reportValidity();render();return;}
  state={...state,preset:'responsive',width:Number(width.value),height:Number(height.value)};change();
 }
 width.onchange=height.onchange=dimensions;
 $('preview-device-rotate').onclick=()=>{[state.width,state.height]=[state.height,state.width];change();};
 render();
 return {bounds(){
  const r=$('browser-surface').getBoundingClientRect(),area={x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
  const result=deviceLayout(area,state.enabled?state:null);
  if(state.enabled){
   Object.assign(frame.style,{left:(result.x-r.x-9)+'px',top:(result.y-r.y-9)+'px',width:(result.width+18)+'px',height:(result.height+18)+'px'});
   $('preview-device-scale').textContent=`Fit · ${Math.round(Math.min(result.width/state.width,result.height/state.height)*100)}%`;
  }
  return result;
 }};
}
