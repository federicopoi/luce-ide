import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/renderer/app.js'],bundle:true,outfile:'dist/app.js',platform:'browser',format:'iife',target:'chrome140',minify:false});
await copyFile('src/renderer/index.html','dist/index.html');await copyFile('src/renderer/styles.css','dist/styles.css');
console.log('Orbit renderer built.');
