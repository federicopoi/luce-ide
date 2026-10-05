#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const root=process.env.GH_CONFIG_DIR,file=path.join(root,'fixture.json'),args=process.argv.slice(2);let user;try{user=JSON.parse(fs.readFileSync(file));}catch{}
if(args[0]==='auth'&&args[1]==='login'){
 process.stderr.write('! First copy your one-time ');setTimeout(()=>process.stderr.write('code: ABCD-1234\nOpen this URL to continue in your web browser: https://github.com/login/device\n'),30);
 const finish=()=>{fs.writeFileSync(file,JSON.stringify({login:path.basename(root).startsWith('zafe')?'agency-user':'personal-user',id:123,name:'Test User'}));process.exit(0);};
 if(process.env.LUCE_FIXTURE_GH_WAIT)setInterval(()=>{if(fs.existsSync(path.join(root,'complete')))finish();},50);
 else if(!fs.existsSync(path.join(root,'hold')))setTimeout(finish,250);else setInterval(()=>{},1000);
}else if(args[0]==='auth'&&args[1]==='status')console.log(JSON.stringify({hosts:{'github.com':user?[{active:true,state:'success',login:user.login,token:'NEVER_EXPORT',tokenSource:'keyring'}]:[]}}));
else if(args[0]==='auth'&&args[1]==='token'){if(!user||args[args.indexOf('--user')+1]!==user.login)process.exit(1);console.log('fixture-token-'+user.login);}
else if(args[0]==='api'&&args[1]==='user'){if(!user)process.exit(1);console.log(JSON.stringify({...user,token:'NEVER_EXPORT'}));}
else if(args[0]==='auth'&&args[1]==='git-credential'){process.stdin.resume();process.stdin.on('end',()=>console.log('username='+user.login+'\npassword='+process.env.GH_TOKEN));}
else process.exit(1);
