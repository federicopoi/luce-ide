export function placeFloating(anchor,size,viewport,margin=8,gap=6){
 const maxLeft=Math.max(margin,viewport.width-size.width-margin),maxTop=Math.max(margin,viewport.height-size.height-margin);
 const below=anchor.bottom+gap,above=anchor.top-size.height-gap;
 return {left:Math.max(margin,Math.min(anchor.left,maxLeft)),top:Math.max(margin,Math.min(below+size.height<=viewport.height-margin?below:above,maxTop))};
}
export function installTooltips(){
 const tip=document.createElement('div');tip.id='ui-tooltip';tip.className='ui-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
 let anchor=null,timer=null;
 const hide=()=>{clearTimeout(timer);tip.hidden=true;anchor?.removeAttribute('aria-describedby');anchor=null;};
 function show(button){hide();anchor=button;const text=button.id==='collapse-projects'?(button.title||button.getAttribute('aria-label')):(button.dataset.tooltip||button.title||button.getAttribute('aria-label'));if(!text)return;
  if(button.title){if(!button.dataset.tooltip)button.dataset.tooltip=button.title;button.removeAttribute('title');}
  timer=setTimeout(()=>{if(!button.isConnected)return;tip.textContent=text;tip.hidden=false;const rect=button.getBoundingClientRect(),size=tip.getBoundingClientRect(),rail=button.closest('.utility-rail');const target=rail?{left:rect.right+10,top:rect.top-size.height/2,bottom:rect.top+rect.height/2-size.height/2-6}:rect;const pos=placeFloating(target,size,{width:innerWidth,height:innerHeight});tip.style.left=pos.left+'px';tip.style.top=pos.top+'px';button.setAttribute('aria-describedby',tip.id);},350);
 }
 const eligible=event=>event.target.closest?.('.utility-rail button,.titlebar .icon-button,.icon-button');
 document.addEventListener('pointerover',event=>{const button=eligible(event);if(button&&button!==anchor)show(button);});
 document.addEventListener('pointerout',event=>{if(anchor&&!anchor.contains(event.relatedTarget))hide();});
 document.addEventListener('focusin',event=>{const button=eligible(event);if(button)show(button);});
 for(const name of ['pointerdown','keydown'])document.addEventListener(name,hide,true);window.addEventListener('resize',hide);
}
