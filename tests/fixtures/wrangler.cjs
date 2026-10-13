#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const root=path.join(process.env.HOME,'.wrangler'),file=path.join(root,'fixture.json'),args=process.argv.slice(2);
fs.mkdirSync(root,{recursive:true});
if(process.env.CLOUDFLARE_API_TOKEN||process.env.CF_API_KEY)throw Error('Inherited credentials leaked');
if(args[0]==='login'){
 const finish=()=>{fs.writeFileSync(file,JSON.stringify({loggedIn:true,email:path.basename(process.env.HOME)+'@example.test',accounts:[{id:'a'.repeat(32),name:'Agency'},{id:'b'.repeat(32),name:'Client'}]}));process.exit(0);};
 if(fs.existsSync(path.join(root,'hold')))setInterval(()=>{},1000);else setTimeout(finish,50);
}else{
 if(fs.existsSync(path.join(root,'malformed'))){console.log('SECRET_FIXTURE');process.exit(0);}
 if(!fs.existsSync(file)){console.error('SECRET_FIXTURE signed out');process.exit(1);}
 if(args[0]==='whoami')console.log(fs.readFileSync(file,'utf8'));
 else if(args[0]==='auth'&&args[1]==='token')console.log(JSON.stringify({type:'oauth',token:'SECRET_FIXTURE_'+path.basename(process.env.HOME)}));
 else process.exit(1);
}
