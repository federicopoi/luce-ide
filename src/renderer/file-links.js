// Return positions in the rendered line; quotes/Markdown wrappers are excluded.
export function findFileLinks(line){
 const result=[],pattern=/(["'`])([^"'`\r\n]+)\1|[^\s<>"'`()\[\]{}]+/g;
 for(const match of line.matchAll(pattern)){
  let text=match[2]||match[0],start=match.index+(match[2]?1:0);text=text.replace(/[,;.!?]+$/,'');
  if(/^[a-z][a-z\d+.-]*:\/\//i.test(text)||text.includes('://'))continue;
  const location=text.replace(/:\d+(?::\d+)?$/,'');
  if(!location||!(/[\/]/.test(location)||/^[^/<>\x00-\x1f]+\.[\p{L}\p{N}]{1,12}$/u.test(location)))continue;
  if(/^[+\-=]+$/.test(location)||location==='/'||location.endsWith('/'))continue;
  result.push({text,start,end:start+text.length});if(result.length===12)break;
 }
 return result;
}
export function installFileLinks(terminal,{locate,reveal}){
 return terminal.registerLinkProvider({provideLinks(lineNumber,callback){
  const buffer=terminal.buffer.active;let first=lineNumber-1,last=first;if(!buffer.getLine(first)){callback(undefined);return;}
  // Reassemble wrapped logical lines, bounded to avoid unbounded hover work.
  for(let count=0;count<8&&first>0&&buffer.getLine(first)?.isWrapped;count++)first--;
  for(let count=0;count<8&&buffer.getLine(last+1)?.isWrapped;count++)last++;
  let text='';const cells=[];
  for(let row=first;row<=last;row++){
   const line=buffer.getLine(row),value=line.translateToString(row===last),base=text.length;let offset=0;
   for(let col=0;col<line.length&&offset<value.length;col++){const cell=line.getCell(col);if(!cell||cell.getWidth()===0)continue;const chars=cell.getChars()||' ';cells.push({start:base+offset,end:base+offset+chars.length,x:col+1,y:row+1,width:cell.getWidth()});offset+=chars.length;}
   text+=value;
  }
  const candidates=findFileLinks(text);
  Promise.all(candidates.map(async candidate=>{const start=cells.find(c=>c.start<=candidate.start&&c.end>candidate.start),end=cells.find(c=>c.start<candidate.end&&c.end>=candidate.end);if(!start||!end||lineNumber<start.y||lineNumber>end.y)return null;try{const location=await locate(candidate.text);return {text:candidate.text,range:{start:{x:start.x,y:start.y},end:{x:end.x+end.width-1,y:end.y}},activate:()=>reveal(location)};}catch{return null;}})).then(links=>callback(links.filter(Boolean))).catch(()=>callback(undefined));
 }});
}
