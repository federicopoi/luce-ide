const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
function browserEnvironment(directory,env){
 const bin=path.join(directory,'browser-bin'),profiles=path.join(directory,'browser-zsh');fs.mkdirSync(bin,{recursive:true,mode:0o700});fs.mkdirSync(profiles,{recursive:true,mode:0o700});
 for(const command of ['open','xdg-open','luce-browser']){const file=path.join(bin,command);fs.writeFileSync(file,`#!/bin/sh\nexec env ELECTRON_RUN_AS_NODE=1 ${quote(process.execPath)} ${quote(path.join(__dirname,'browser-open.cjs'))} ${quote(command)} "$@"\n`,{mode:0o700});fs.chmodSync(file,0o700);}
 // macOS login shells rebuild PATH. Proxy the user's startup files and prepend
 // only our private command directory afterwards, without editing their files.
 for(const name of ['.zshenv','.zprofile','.zshrc','.zlogin','.zlogout']){
  const source=`if [[ -r "$LUCE_USER_ZDOTDIR/${name}" && "$LUCE_USER_ZDOTDIR" != "$LUCE_BROWSER_ZDOTDIR" ]]; then\n export ZDOTDIR="$LUCE_USER_ZDOTDIR"\n source "$LUCE_USER_ZDOTDIR/${name}"\nfi\nif [[ "$ZDOTDIR" != "$LUCE_BROWSER_ZDOTDIR" ]]; then\n export LUCE_USER_ZDOTDIR="$ZDOTDIR"\n [[ -n "$LUCE_USER_ZDOTDIR" ]] || export LUCE_USER_ZDOTDIR="$HOME"\nfi\nexport ZDOTDIR="$LUCE_BROWSER_ZDOTDIR"\ntypeset -U path\npath=("$LUCE_BROWSER_BIN" $path)\nexport PATH\n`;
  fs.writeFileSync(path.join(profiles,name),source,{mode:0o600});
 }
 return {...env,BROWSER:path.join(bin,'luce-browser'),PATH:`${bin}${path.delimiter}${env.PATH||''}`,LUCE_BROWSER_BIN:bin,LUCE_USER_ZDOTDIR:env.LUCE_USER_ZDOTDIR||env.ZDOTDIR||env.HOME||os.homedir(),LUCE_BROWSER_ZDOTDIR:profiles,ZDOTDIR:profiles};
}
module.exports={browserEnvironment};
