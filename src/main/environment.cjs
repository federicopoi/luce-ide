const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
async function resolveEnvironment(){
 const home=os.homedir(),shell=process.env.SHELL||'/bin/zsh';let env={...process.env};
 try{const {stdout}=await promisify(execFile)(shell,['-ilc','/usr/bin/env -0'],{cwd:home,timeout:5000,maxBuffer:1024*1024});for(const entry of stdout.split('\0')){const equals=entry.indexOf('=');if(equals>0&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.slice(0,equals)))env[entry.slice(0,equals)]=entry.slice(equals+1);}}catch{}
 const extra=[path.join(home,'.local/bin'),'/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'];
 try{for(const version of fs.readdirSync(path.join(home,'.nvm/versions/node')).sort().reverse())extra.push(path.join(home,'.nvm/versions/node',version,'bin'));}catch{}
 env.PATH=[...new Set([...(env.PATH||'').split(':'),...extra])].filter(Boolean).join(':');delete env.ELECTRON_RUN_AS_NODE;
 env.TERM='xterm-256color';env.COLORTERM='truecolor';env.TERM_PROGRAM='Orbit';env.TERM_PROGRAM_VERSION='0.1.0';
 const executables={};for(const command of ['codex','claude'])for(const directory of env.PATH.split(':')){const file=path.join(directory,command);try{fs.accessSync(file,fs.constants.X_OK);executables[command]=file;break;}catch{}}
 return {env,shell,executables};
}
module.exports={resolveEnvironment};
