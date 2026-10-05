const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
function playPing(file){const child=spawn('/usr/bin/afplay',['-v','0.45',file],{stdio:'ignore'});const timer=setTimeout(()=>child.kill(),3000);timer.unref();child.once('exit',()=>clearTimeout(timer));child.once('error',()=>clearTimeout(timer));}
class CompletionSound{
 constructor({directory,play,clock=Date.now}){this.file=path.join(directory,'sound-preferences.json');if(play)this.play=play;else{fs.mkdirSync(directory,{recursive:true});const soundFile=path.join(directory,'completion.wav');fs.copyFileSync(path.join(__dirname,'../../assets/completion.wav'),soundFile);this.play=()=>playPing(soundFile);}this.clock=clock;this.lastPlayed=-Infinity;this.enabled=true;try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(typeof saved.completionSound==='boolean')this.enabled=saved.completionSound;}catch{}}
 setEnabled(enabled){if(typeof enabled!=='boolean')throw Error('Invalid sound setting.');fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify({completionSound:enabled}),{mode:0o600});this.enabled=enabled;return enabled;}
 preview(){this.play();}
 complete(session){if(!this.enabled||!session||session.status!=='running'||!['codex','claude'].includes(session.provider))return false;const now=this.clock();if(now-this.lastPlayed<2000)return false;this.lastPlayed=now;this.play();return true;}
}
module.exports={CompletionSound};
