// Browser commands spawned by a Luce terminal use its authenticated local broker.
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const {previewURL}=require('./validation.cjs');
function destinations(args){
 const result=[];let options=true;
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(options&&arg==='--'){options=false;continue;}
  if(options&&['-a','-b'].includes(arg)){if(!args[++i])throw Error('Missing application argument.');continue;}
  if(options&&/^-[gnjFW]+$/.test(arg))continue;
  if(options&&arg.startsWith('-'))throw Error('Unsupported browser-opening option.');
  result.push(arg);
 }
 return result;
}
async function open(args,env=process.env,{spawn=spawnSync}={}){
 const [command,...input]=args;
 const isWebsite=url=>/^https?:/i.test(url)||/^(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:[/?#]|$)/i.test(url);
 const web=input.some(isWebsite);
 // Keep Finder and ordinary document opening intact; web commands never fall back.
 if(command==='open'&&!web&&!input.some(url=>/^[a-z][a-z0-9+.-]*:/i.test(url))){const result=spawn('/usr/bin/open',input,{stdio:'inherit',env});if(result.error)throw result.error;if(result.status!==0)throw Error('Could not open the file.');return;}
 const urls=destinations(input);if(!urls.length)throw Error('Supply a website URL.');
 for(const input of urls){if(!isWebsite(input))throw Error('Only HTTP and HTTPS website previews are supported.');const url=previewURL(input);await post(url,env);}
}
function post(url,env){return new Promise((resolve,reject)=>{
 let broker;try{broker=new URL('/preview',env.LUCE_APPROVAL_URL);if(broker.protocol!=='http:'||broker.hostname!=='127.0.0.1')throw Error();}catch{reject(Error('Luce preview connection is unavailable.'));return;}
 const body=JSON.stringify({terminalId:env.LUCE_TERMINAL_ID,url});const req=http.request(broker,{method:'POST',headers:{authorization:`Bearer ${env.LUCE_APPROVAL_TOKEN}`,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>res.statusCode===204?resolve():reject(Error('Luce could not open this preview.')));});req.setTimeout(5000,()=>req.destroy(Error('Luce preview request timed out.')));req.on('error',reject);req.end(body);
});}
if(require.main===module)open(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={open,destinations};
