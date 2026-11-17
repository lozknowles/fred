import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {packageOutputSurfaceDerivative} from './output-surface-transform.mjs';
const [old,manifestPath,expected,dist,target]=process.argv.slice(2);if(!target||!/^([a-f0-9]{64})$/.test(expected))throw Error('Expected a previously published root, manifest, SHA-256, build and new output folder');
const sha=b=>createHash('sha256').update(b).digest('hex'),guard=n=>typeof n==='string'&&!n.split('/').some(p=>!p||p.startsWith('.'))&&!/[\\:\x00-\x1f]/.test(n)&&!path.isAbsolute(n);
const bytes=await fs.readFile(manifestPath);if(sha(bytes)!==expected)throw Error('Public list has changed');const prev=JSON.parse(bytes).files;
await fs.mkdir(target);const player=path.join(target,'player');await fs.mkdir(player);const files=Object.create(null);
async function put(n,source,expectedHash){if(!guard(n))throw Error('Unexpected path');const src=path.join(source,n),info=await fs.lstat(src);if(!info.isFile()||await fs.realpath(src)!==src)throw Error('Unexpected source');const b=await fs.readFile(src),h=sha(b);if(expectedHash&&h!==expectedHash)throw Error('Unexpected content: '+n);await fs.mkdir(path.dirname(path.join(player,n)),{recursive:true});await fs.writeFile(path.join(player,n),b);files[n]=h;}
for(const [n,d]of Object.entries(prev))await put(n,old,d);
for(const n of ['index.html','worlds.html','output-surface-derivative.json'])await put(n,dist);
for(const f of await fs.readdir(path.join(dist,'assets'))){if(!/^[A-Za-z0-9_.-]+\.(js|css|mp3|ogg|png|svg|webp|woff2?)$/.test(f))throw Error('Unexpected build asset: '+f);await put('assets/'+f,dist);}
await packageOutputSurfaceDerivative(dist,player);
await fs.writeFile(path.join(target,'preview-manifest.json'),JSON.stringify({files}));
await fs.copyFile(new URL('./serve-showcase-preview.mjs',import.meta.url),path.join(target,'serve.mjs'));
for(const [filename,args]of [['Play-Fred-1080p.cmd',''],['Play-Fred-1440p.cmd',' --1440']])await fs.writeFile(path.join(target,filename),'@echo off\r\ncd /d "%~dp0"\r\nnode "%~dp0serve.mjs" --open'+args+'\r\nif errorlevel 1 pause\r\n');
console.log('Verified',Object.keys(files).length,'public files');
