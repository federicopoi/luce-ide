export function providerAccountLabel(provider,name){
 if(provider==='codex')return `Codex - ${name||'Existing login'}`;
 if(provider==='claude')return `Claude - ${name||'Existing login'}`;
 return 'Terminal';
}
