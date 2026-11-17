// Stand-alone public-content preview. Run from beside player/ and preview-manifest.json.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'player'),files=JSON.parse(await fs.readFile(path.join(here,'preview-manifest.json'),'utf8')).files;
const args=process.argv.slice(2);if(args.some(a=>!['--open','--1440'].includes(a)))throw Error('Use --open and/or --1440');
const publicFiles=new Map(Object.entries(files));if(!publicFiles.has('index.html')||!publicFiles.has('published-worlds.json'))throw Error('Invalid preview');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.mp4':'video/mp4'};
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:'+server.address().port){res.writeHead(403).end();return;}if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const n=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname.slice(1))||'index.html',sha=publicFiles.get(n);if(!sha||/[\\:\x00-\x1f]/.test(n)||n.split('/').some(x=>!x||x.startsWith('.'))){res.writeHead(404).end();return;}
 const f=await fs.realpath(path.join(root,...n.split('/'))),relative=path.relative(root,f);if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(404).end();return;}
 const data=await fs.readFile(f);if(createHash('sha256').update(data).digest('hex')!==sha){res.writeHead(409).end('Preview file changed');return;}
 res.writeHead(200,{'content-type':types[path.extname(n)]??'application/octet-stream','content-length':data.length,'x-content-type-options':'nosniff','cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
const url='http://127.0.0.1:'+server.address().port+'/?quality='+(args.includes('--1440')?'showcase':'showcase1080');
console.log(url);console.log('Fred Showcase - press M to change quality. Close this console to stop the preview.');
if(args.includes('--open')&&process.platform==='win32')spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true}).unref();
