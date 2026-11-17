import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {inspectGlbJson as old} from '../src/world-runtime/vendor/world-engine-contract.js';
import {optimizeGlbScans} from './glb-accessor-scan.mjs';
const [base,out]=process.argv.slice(2),raw=await fs.readFile(new URL('../src/world-runtime/vendor/world-engine-contract.js',import.meta.url),'utf8');
const next=(await import('data:text/javascript;base64,'+Buffer.from(optimizeGlbScans(raw.replaceAll('\r\n','\n'))).toString('base64'))).inspectGlbJson;
const cat=JSON.parse(await fs.readFile(path.join(base,'published-worlds.json'))),dock=cat.worlds.find(w=>w.contentDigest==='36e60f42dffa422ef20dce60a14a9da238ccce49eb96e248dc5952f6b3429808');
const world=path.join(base,dock.bundlePath),manifest=JSON.parse(await fs.readFile(path.join(world,'world.json'))),entries=JSON.parse(await fs.readFile(path.join(world,manifest.components.assets.path)));
const assets=[];for(const asset of entries){const bytes=await fs.readFile(path.join(world,asset.file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.file.sha256);const b=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);assert.deepEqual(next(b),old(b));assets.push({id:asset.id,b});}
const results=[];for(let i=0;i<10;++i){const order=i%2?[['new',next],['old',old]]:[['old',old],['new',next]];for(const [name,fn]of order){const ms={};for(const {id,b}of assets){const t=performance.now();fn(b);ms[id]=performance.now()-t}if(i>=2)results.push({name,iteration:i,ms,total:Object.values(ms).reduce((a,b)=>a+b)});}}
await fs.writeFile(out,JSON.stringify({world:dock.contentDigest,node:process.version,results},null,2),{flag:'wx'});
for(const arm of ['old','new']){const t=results.filter(x=>x.name===arm).map(x=>x.total).sort((a,b)=>a-b);console.log(arm,'median',(t[3]+t[4])/2,'min',t[0],'max',t.at(-1));}
