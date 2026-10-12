// Consume preview link clicks before xterm reports them to a mouse-aware CLI.
// Otherwise both Luce and the CLI can open the same destination.
export function createTerminalWebLinks(open){
 let hovered=null,pressed=null,element=null;
 const valid=text=>{try{const url=new URL(text);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}};
 const handler={
  activate(event,text){event?.preventDefault();const url=valid(text);if(url)open(url);},
  hover(_event,text){hovered=valid(text);},
  leave(){hovered=null;}
 };
 function down(event){
  if(event.button!==0||event.shiftKey||!hovered)return;
  pressed={url:hovered,x:event.clientX,y:event.clientY};
  event.preventDefault();event.stopImmediatePropagation();
 }
 function up(event){
  if(!pressed||event.button!==0)return;const click=pressed;pressed=null;
  event.preventDefault();event.stopImmediatePropagation();
  if(element.contains(event.target)&&hovered===click.url&&Math.hypot(event.clientX-click.x,event.clientY-click.y)<=4)open(click.url);
 }
 return {handler,mount(root){element=root;root.addEventListener('mousedown',down,true);root.ownerDocument.addEventListener('mouseup',up,true);},dispose(){element?.removeEventListener('mousedown',down,true);element?.ownerDocument.removeEventListener('mouseup',up,true);pressed=null;hovered=null;}};
}
