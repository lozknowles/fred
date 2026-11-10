// Create a reviewable receipt; this does not expose or start the release.
import {readdir,realpath,writeFile,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';
const [rootArg,outArg]=process.argv.slice(2);if(!rootArg||!outArg)throw Error('Usage: node public-fred-manifest.mjs RELEASE_ROOT EXTERNAL_MANIFEST');
const root=await realpath(rootArg),out=resolve(outArg),rel=relative(root,out);if(rel!== '..'&&!rel.startsWith('..'+sep))throw Error('Manifest must be outside release');
const files={};async function walk(dir,prefix=''){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=prefix+entry.name,file=resolve(dir,entry.name);if(entry.isSymbolicLink())throw Error('Symlink in release '+path);if(entry.isDirectory())await walk(file,path+'/');else{if(!(await lstat(file)).isFile())throw Error('Not regular '+path);const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);files[path]=hash.digest('hex');}}}
await walk(root);const bytes=JSON.stringify({schema:'fred.public-static/1',files},null,2)+'\n';await writeFile(out,bytes,{flag:'wx'});console.log(JSON.stringify({manifest:out,sha256:createHash('sha256').update(bytes).digest('hex'),files:Object.keys(files).length}));
