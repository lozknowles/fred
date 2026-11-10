import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter,once} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import http from 'node:http';
import {WebSocket} from 'ws';
import {createPublicFredServer} from '../tools/public-fred-server.mjs';
import {createPublicPeriodSunBroker} from '../tools/public-period-sun.mjs';
import {sunGuestSocketURL} from '../src/world-runtime/SunGuestConsole.js';
test('public profile serves only approved bytes and isolates anonymous guests',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'fred-public-'));await mkdir(join(temp,'site'));await writeFile(join(temp,'site/index.html'),'public');await writeFile(join(temp,'site/private.json'),'SECRET');
 const manifestPath=join(temp,'manifest.json');await writeFile(manifestPath,JSON.stringify({schema:'fred.public-static/1',files:{'index.html':createHash('sha256').update('public').digest('hex')}}));
 const children=[];const spawnWorker=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.inputs=[];child.stdin=new Writable({write(b,e,done){const v=JSON.parse(b.toString());child.inputs.push(v);if(v.type==='end')queueMicrotask(()=>child.emit('close'));done();}});child.kill=()=>child.emit('close');children.push(child);return child;};
 const {server,broker}=await createPublicFredServer({root:join(temp,'site'),manifestPath,origin:'https://fred.example',worker:'/private/worker.py',spawnWorker});server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port;const request=(path,{method='GET',cookie,csrf,body,origin='https://fred.example',host='fred.example'}={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,headers:{Host:host,Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-Fred-Sun-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 let a,b,ws;try{
  assert.equal((await request('/')).data,'public');for(const path of ['/private.json','/.fred-server/secrets','/api/ai','/api/voice','/runtime-config','//example.com/'])assert.ok((await request(path)).status>=400,path);
  assert.equal((await request('/',{host:'evil.example'})).status,403);
  const session=async()=>{const r=await request('/api/period-sun/session');assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Strict; Path=\//);return {cookie:r.headers['set-cookie'][0].split(';')[0],csrf:JSON.parse(r.data).csrf};};a=await session();b=await session();assert.notEqual(a.cookie,b.cookie);
  assert.equal((await request('/api/period-sun/start',{...a,method:'POST',body:{system:'netbsd'},origin:'https://evil.example'})).status,403);
  const start=async owner=>{const r=await request('/api/period-sun/start',{...owner,method:'POST',body:{system:'netbsd'}});assert.equal(r.status,201);return JSON.parse(r.data);};
  const ga=await start(a),gb=await start(b);assert.notEqual(ga.sessionId,gb.sessionId);assert.equal(children.length,2);assert.equal(broker.stats().guests,2);
  // Guestless cookie churn cannot fill a four-hour admission lockout or evict active owners.
  for(let i=0;i<300;i++)await session();assert.equal(broker.stats().owners,256);
  assert.equal((await request('/api/period-sun/session',a)).status,200);
  assert.equal((await request('/api/period-sun/session',b)).status,200);
  assert.equal((await request('/api/period-sun/end',{...b,method:'POST',body:{sessionId:ga.sessionId}})).status,404);
  const c=await session();assert.equal((await request('/api/period-sun/start',{...c,method:'POST',body:{system:'netbsd'}})).status,429);
  const attach=(owner,guest)=>{const frontendURL=sunGuestSocketURL(guest.wsPath,'https://fred.example',guest.sessionId,guest.ticket);assert.equal(new URL(frontendURL).pathname,'/api/period-sun/ws');return new WebSocket(frontendURL.replace('wss://fred.example',`ws://127.0.0.1:${port}`),{headers:{Host:'fred.example',Origin:'https://fred.example',Cookie:owner.cookie}});};
  for(const path of ['https://evil.example/api/period-sun/ws','/api/period-sun/socket','/api/period-sun/ws?extra=1','/api/period-sun/ws#extra'])assert.throws(()=>sunGuestSocketURL(path,'https://fred.example',ga.sessionId,ga.ticket));
  const bad=attach(b,ga);bad.on('error',()=>{});await new Promise(r=>bad.on('close',r));assert.equal(children[0].inputs.length,1);
  const malformed=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:`${ga.wsPath}?sessionId=${ga.sessionId}&ticket=${ga.ticket}`,headers:{Host:'fred.example',Origin:'https://fred.example',Cookie:a.cookie,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'invalid'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(malformed,400);
  // A rejected handshake has not consumed the ticket; the normal retry below succeeds.
  ws=attach(a,ga);await once(ws,'open');const output=once(ws,'message');children[0].stdout.write(JSON.stringify({type:'output',data:Buffer.from('guest-a-only').toString('base64')})+'\n');assert.match((await output)[0].toString(),/Z3Vlc3QtYS1vbmx5/);
  const rejected=once(ws,'message');ws.send(JSON.stringify({type:'input',data:Buffer.alloc(3073,65).toString('base64')}));assert.equal(JSON.parse((await rejected)[0].toString()).type,'error');await new Promise(r=>setTimeout(r,10));assert.equal(ws.readyState,WebSocket.OPEN);assert.equal(children[0].inputs.length,1);assert.equal(broker.stats().guests,2);
  ws.send(JSON.stringify({type:'input',data:Buffer.from('id\r').toString('base64')}));await new Promise(r=>setTimeout(r,10));assert.equal(children[0].inputs.at(-1).type,'input');
  ws.close();await once(ws,'close');await new Promise(r=>setTimeout(r,20));assert.equal(broker.stats().guests,1);
  assert.equal((await request('/api/period-sun/end',{...b,method:'POST',body:{sessionId:gb.sessionId}})).status,200);await new Promise(r=>setTimeout(r,20));assert.equal(broker.stats().guests,0);
  const afterFlood=await session();await start(afterFlood);assert.equal(broker.stats().guests,1);
 }finally{ws?.terminate();broker.close();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
});

test('a malformed upgrade preserves the unattached guest deadline',async()=>{
 let ends=0;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(data,encoding,done){if(JSON.parse(data.toString()).type==='end'){ends++;queueMicrotask(()=>child.emit('close'));}done();}});child.kill=()=>child.emit('close');
 const broker=createPublicPeriodSunBroker({origin:'https://fred.example',connection:{sunos:false},spawnWorker:()=>child,attachMs:120});
 const server=http.createServer((req,res)=>broker.handle(req,res));server.on('upgrade',(req,socket,head)=>broker.upgrade(req,socket,head));server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 const request=(path,headers={},body)=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method:body?'POST':'GET',headers:{Host:'fred.example',Origin:'https://fred.example',...headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});req.on('error',reject);req.end(body);});
 try{const cap=await request('/api/period-sun/session'),cookie=cap.headers['set-cookie'][0].split(';')[0],csrf=JSON.parse(cap.text).csrf;const response=await request('/api/period-sun/start',{Cookie:cookie,'content-type':'application/json','x-fred-sun-token':csrf},JSON.stringify({system:'netbsd'}));const guest=JSON.parse(response.text);
  const malformed=await request(`${guest.wsPath}?sessionId=${guest.sessionId}&ticket=${guest.ticket}`,{Cookie:cookie,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'invalid'});assert.equal(malformed.status,400);assert.equal(broker.stats().guests,1);
  await new Promise(r=>setTimeout(r,180));assert.equal(ends,1);assert.equal(broker.stats().guests,0);
 }finally{broker.close();await new Promise(r=>server.close(r));}
});
