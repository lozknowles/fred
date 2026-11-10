import http from 'node:http';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createPublicPeriodSunBroker} from './public-period-sun.mjs';

const forbidden=p=>p.split('/').some(x=>x.startsWith('.'))||/(?:^|\/)(?:portrait-preset|private|secrets?|worker-config|package(?:-lock)?\.json|publication\.json|tools|src|test|node_modules)(?:[./-]|$)/i.test(p);
const notice=p=>/^(?:(?:LICENSE|NOTICE)|worlds\/[a-f0-9]{64}\/(?:LICENSE|NOTICE)|licenses\/XTERM-(?:xterm|addon-fit)-LICENSE)$/.test(p);
const contained=(root,file)=>{const p=relative(root,file);return p!==''&&!p.startsWith('..'+sep)&&p!=='..'&&!isAbsolute(p);};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.mp4':'video/mp4','.glb':'model/gltf-binary'};
export async function createPublicFredServer({root,manifestPath,origin,worker,maxGuests=2,attachMs=30000,spawnWorker}={}){
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('Exact public HTTPS origin required');
 root=await realpath(root);manifestPath=await realpath(manifestPath);if(contained(root,manifestPath))throw Error('Manifest must be outside static root');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));if(manifest.schema!=='fred.public-static/1'||!manifest.files||!Object.hasOwn(manifest.files,'index.html'))throw Error('Invalid public manifest');
 const files=new Map();for(const [path,digest] of Object.entries(manifest.files)){
  if(path.startsWith('/')||path.includes('\\')||path.split('/').includes('..')||forbidden(path)||(!extname(path)&&!notice(path))||! /^[a-f0-9]{64}$/.test(digest))throw Error('Unsafe public file '+path);
  const file=await realpath(resolve(root,path));if(!contained(root,file))throw Error('File escapes static root');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==digest)throw Error('Public file hash mismatch '+path);
  const info=await stat(file);if(!info.isFile())throw Error('Public file not regular');files.set('/'+path,{file,size:info.size,digest,notice:notice(path)});
 }
 if(worker&&(!isAbsolute(worker)||!worker.endsWith('.py')))throw Error('Absolute administrator worker path required');
 const broker=createPublicPeriodSunBroker({origin,connection:worker?{sunos:false}:null,maxGuests,attachMs,spawnWorker:spawnWorker??(()=>spawn('python3',[worker],{shell:false,stdio:['pipe','pipe','pipe']}))});
 const server=http.createServer(async(req,res)=>{try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  if(req.headers.host!==url.host||req.url.length>2048||!req.url.startsWith('/')||req.url.startsWith('//')){res.writeHead(403).end();return;}
  if(await broker.handle(req,res))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const path=new URL(req.url,origin).pathname;
  // No SPA fallback: every public byte has an explicitly approved manifest entry.
  const entry=files.get(path==='/'?'/index.html':path);if(!entry){res.writeHead(404).end();return;}
  const {file,size,digest}=entry;let start=0,end=size-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}start=Number(match[1]);end=match[2]?Number(match[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||end>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
  res.setHeader('Content-Type',entry.notice||['.txt','.md'].includes(extname(file))?'text/plain; charset=utf-8':mime[extname(file)]??'application/octet-stream');res.setHeader('Content-Length',Math.max(0,end-start+1));res.setHeader('ETag',`"${digest}"`);res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','public, max-age=300');res.writeHead(status);
  if(req.method==='HEAD'||size===0){res.end();return;}const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch{if(!res.headersSent)res.writeHead(500);res.end();}});
 server.headersTimeout=10000;server.requestTimeout=15000;server.maxHeadersCount=32;server.keepAliveTimeout=5000;
 server.on('upgrade',(req,socket,head)=>{try{if(!broker.upgrade(req,socket,head))socket.destroy();}catch{socket.destroy();}});
 server.on('close',()=>broker.close());return {server,broker,files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const config=JSON.parse(await readFile(process.argv[2],'utf8'));if(Object.keys(config).some(k=>!['root','manifestPath','origin','worker','maxGuests','port'].includes(k))||!Number.isInteger(config.port)||config.port<1024||config.port>65535||!Number.isInteger(config.maxGuests)||config.maxGuests<1||config.maxGuests>4)throw Error('Invalid administrator configuration');
 const {server,broker}=await createPublicFredServer(config);server.listen(config.port,'127.0.0.1',()=>console.log('Fred public profile listening on loopback port '+config.port));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{broker.close();server.close();setTimeout(()=>process.exit(0),4000).unref();});
}
