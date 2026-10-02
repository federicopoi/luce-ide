import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
await mkdir('assets/Luce.iconset',{recursive:true});
execFileSync('swift',['scripts/icon.swift','assets/Luce.png'],{stdio:'inherit'});
for(const size of [16,32,128,256,512])for(const scale of [1,2]){
 const pixels=size*scale,name=`icon_${size}x${size}${scale===2?'@2x':''}.png`;
 execFileSync('sips',['-z',String(pixels),String(pixels),'assets/Luce.png','--out',path.join('assets/Luce.iconset',name)],{stdio:'ignore'});
}
execFileSync('iconutil',['-c','icns','assets/Luce.iconset','-o','assets/Luce.icns'],{stdio:'inherit'});
console.log('Luce app icon generated.');
