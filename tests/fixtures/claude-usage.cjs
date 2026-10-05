#!/usr/bin/env node
const {execSync}=require('node:child_process');const args=process.argv.slice(2),at=args.indexOf('--settings'),settings=JSON.parse(args[at+1]);const data={rate_limits:{five_hour:{used_percentage:34,resets_at:Math.floor(Date.now()/1000)+3600},seven_day:{used_percentage:51,resets_at:Math.floor(Date.now()/1000)+86400}},apiKey:'MUST_NOT_BE_EXPORTED'};
console.log(execSync(settings.statusLine.command,{input:JSON.stringify(data),env:process.env}).toString());console.log('CLAUDE_USAGE_READY');process.stdin.resume();setInterval(()=>{},1000);
