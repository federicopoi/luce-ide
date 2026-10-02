function previewURL(input){
 if(typeof input!=='string'||input.length>4096||!input.trim())throw Error('Enter an HTTP or HTTPS URL.');
 let text=input.trim();if(!/^[a-z][a-z0-9+.-]*:/i.test(text)||/^(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/i.test(text))text=`http://${text}`;
 let url;try{url=new URL(text);}catch{throw Error('Enter a valid HTTP or HTTPS URL.');}
 if(!['http:','https:'].includes(url.protocol))throw Error('Only HTTP and HTTPS preview URLs are supported.');
 if(url.username||url.password)throw Error('Preview URLs cannot contain credentials.');
 if(url.hostname==='0.0.0.0'||url.hostname==='[::]')url.hostname='localhost';return url.href;
}
function detectLocalURL(text){
 const clean=text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 const match=clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\])(?::\d+)?(?:\/[^\s\x1b<>"'\\]*)?/i);
 if(!match)return null;try{return previewURL(match[0].replace(/[),.;]+$/,''));}catch{return null;}
}
function launchSpec(provider,sessionId,executables){
 if(!['codex','claude'].includes(provider))throw Error('Unknown conversation provider.');
 const file=executables[provider];if(!file)throw Error(`${provider==='codex'?'Codex':'Claude Code'} is not installed or could not be found. Install it, then reopen Orbit.`);
 if(sessionId!==null&&sessionId!==undefined&&!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId))throw Error('Invalid conversation session ID.');
 return {file,args:sessionId?(provider==='codex'?['resume',sessionId]:['--resume',sessionId]):[]};
}
module.exports={previewURL,detectLocalURL,launchSpec};
