// Answer startup palette probes even when no renderer has attached yet.
// Consume the probes so replaying a transcript cannot inject late replies.
const foreground='#ececec',background='#1c1c1c';
const queries=[10,11].flatMap(slot=>['\x07','\x1b\\'].map(end=>`\x1b]${slot};?${end}`));
function rgb(hex){return hex.slice(1).match(/../g).map(part=>part+part).join('/');}
class TerminalPalette {
 constructor(reply){this.reply=reply;this.pending='';}
 consume(data){
  let output=(this.pending+data).replace(/\x1b\](10|11);\?(?:\x07|\x1b\\)/g,(_match,slot)=>{this.reply(`\x1b]${slot};rgb:${rgb(slot==='10'?foreground:background)}\x1b\\`);return '';});
  this.pending='';
  for(let length=Math.min(8,output.length);length>0;length--){const tail=output.slice(-length);if(queries.some(query=>query.startsWith(tail))){this.pending=tail;output=output.slice(0,-length);break;}}
  return output;
 }
}
module.exports={TerminalPalette,foreground,background};
