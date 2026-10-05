export const TERMINAL_SPLIT_KEY='luce-terminal-splits';
export const TERMINAL_SPLIT_DEFAULT=Object.freeze({columns:.5,rows:.5});

export function clampTerminalSplit(value,extent,minPane=Math.min(180,Math.max(0,(Number(extent)-8)*.32)),divider=8){
 const usable=Math.max(1,Number(extent)-divider),minimum=Math.min(.5,minPane/usable),number=Number(value);
 return Math.max(minimum,Math.min(1-minimum,Number.isFinite(number)?number:.5));
}

export function terminalSplitKey(projectId){return `${TERMINAL_SPLIT_KEY}:${projectId}`;}

export function readTerminalSplit(projectId,storage=globalThis.localStorage){
 try{
  const value=JSON.parse(storage.getItem(terminalSplitKey(projectId))||'null');
  return {columns:clampTerminalSplit(value?.columns,1000,0),rows:clampTerminalSplit(value?.rows,1000,0)};
 }catch{return {...TERMINAL_SPLIT_DEFAULT};}
}

export function writeTerminalSplit(projectId,value,storage=globalThis.localStorage){
 try{storage.setItem(terminalSplitKey(projectId),JSON.stringify({columns:value.columns,rows:value.rows}));}catch{}
}

export function columnFill(ids,id,layout){
 if(layout!==4||!id)return null;const slot=ids.indexOf(id);if(slot<0||slot>3)return null;const mate=slot<2?slot+2:slot-2;if(ids[mate])return null;return {slot,mate,column:slot%2};
}
