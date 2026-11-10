import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter,once} from 'node:events';
import {PassThrough} from 'node:stream';
import {WebSocket} from 'ws';
import {createPeriodSunBroker} from '../tools/local-period-sun.mjs';
import {sunGuestSocketURL} from '../src/world-runtime/SunGuestConsole.js';
test('Sun broker binds owner, CSRF, guest enum and one-use websocket ticket',async()=>{
 const children=[];const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const broker=createPeriodSunBroker({origin,connection:{sunos:false},spawnWorker:()=>{const c=new EventEmitter();c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>c.emit('close',0);c.stdin.on('data',b=>{if(b.toString().includes('"end"'))setImmediate(()=>c.emit('close',0));});children.push(c);return c;}});
 server.on('request',(q,s)=>broker.handle(q,s));server.on('upgrade',(q,s,h)=>broker.upgrade(q,s,h));
 let ws;
 try{
  const get=await fetch(origin+'/api/period-sun/session');const session=await get.json();const cookie=get.headers.get('set-cookie').split(';')[0];assert.deepEqual(session.systems,['netbsd']);
  const post=(path,value,extra={})=>fetch(origin+'/api/period-sun/'+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-fred-sun-token':session.csrf,...extra},body:JSON.stringify(value)});
  assert.equal((await post('start',{system:'netbsd'},{origin:'http://evil.example'})).status,403);
  assert.equal((await post('start',{system:'netbsd'},{'x-fred-sun-token':'x'.repeat(43)})).status,403);
  assert.equal((await post('start',{system:'netbsd',disk:'/etc/passwd'})).status,400);
  assert.equal((await post('start',{system:'sunos'})).status,400);
  const started=await post('start',{system:'netbsd'});assert.equal(started.status,201);const ticket=await started.json();
  assert.equal((await post('start',{system:'netbsd'})).status,429);
  const wsUrl=sunGuestSocketURL(ticket.wsPath,origin,ticket.sessionId,ticket.ticket);
  ws=new WebSocket(wsUrl,{origin,headers:{cookie}});await once(ws,'open');
  const received=once(ws,'message');children[0].stdout.write(JSON.stringify({type:'output',data:Buffer.from('NetBSD REAL').toString('base64')})+'\n');assert.equal(JSON.parse((await received)[0]).type,'output');
  const input=once(children[0].stdin,'data');ws.send(JSON.stringify({type:'input',data:Buffer.from('uname -a\r').toString('base64')}));assert.equal(JSON.parse((await input)[0]).type,'input');
  const display=once(children[0].stdin,'data');ws.send(JSON.stringify({type:'display',enabled:true}));assert.deepEqual(JSON.parse((await display)[0]),{type:'display',enabled:true});
  const frame=once(ws,'message');children[0].stdout.write(JSON.stringify({type:'frame',format:'jpeg',width:1024,height:768,data:'aGVsbG8='})+'\n');assert.equal(JSON.parse((await frame)[0]).type,'frame');
  const replay=new WebSocket(wsUrl,{origin,headers:{cookie}});replay.on('error',()=>{});await new Promise(resolve=>replay.on('close',resolve));
  const closed=once(ws,'close');assert.equal((await post('end',{sessionId:ticket.sessionId})).status,200);await closed;
 }finally{ws?.terminate();broker.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
