import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {once,EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createAvatarSpeechHandler,validateVoiceConnection,synthesizeOverSSH} from '../tools/local-avatar-voice.mjs';

const wav=Buffer.alloc(46);wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVE',8);
async function fixture(t,synthesize) {
 const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,origin='http://127.0.0.1:'+port;
 const handle=createAvatarSpeechHandler({origin,connection:{configured:true},synthesize});
 server.on('request',(req,res)=>{void handle(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}});});
 t.after(()=>{server.closeAllConnections();server.close();});
 const session=await(await fetch(origin+'/api/avatar-voice/session')).json();
 const headers={'Content-Type':'application/json',Origin:origin,'X-Fred-Voice-Token':session.token};
 return {server,origin,headers,session,post:(value={text:'Hello from Fred.'},options={})=>fetch(origin+'/api/avatar-voice',{method:'POST',headers,body:JSON.stringify(value),...options})};
}
test('host origin token schema method and body rejection cannot launch speech',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return wav;});
 for(const [headers,value,status] of [
  [{...f.headers,Origin:'https://attacker.invalid'},{text:'Hi'},403],
  [{...f.headers,'X-Fred-Voice-Token':'wrong'},{text:'Hi'},403],
  [{...f.headers,'X-Fred-Voice-Token':'é'.repeat(64)},{text:'Hi'},403],
  [{...f.headers,'Content-Type':'text/plain'},{text:'Hi'},403],
  [{...f.headers,'Sec-Fetch-Site':'cross-site'},{text:'Hi'},403],
  [f.headers,{text:'Hi',host:'evil'},400],
  [f.headers,{text:'x'.repeat(181)},400],
  [f.headers,{text:'  '},400],
  [f.headers,{text:'x'.repeat(2200)},413],
 ]){const response=await f.post(value,{headers});assert.equal(response.status,status);await response.arrayBuffer();}
 const wrongHost=await new Promise((resolve,reject)=>{const req=request(f.origin+'/api/avatar-voice/session',{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(wrongHost,403);
 const foreignSession=await fetch(f.origin+'/api/avatar-voice/session',{headers:{Origin:'https://attacker.invalid'}});assert.equal(foreignSession.status,403);
 const deleted=await fetch(f.origin+'/api/avatar-voice',{method:'DELETE',headers:f.headers});assert.equal(deleted.status,403);
 assert.equal(calls,0);
 const good=await f.post({text:'  Hello\nFred. '});assert.equal(good.status,200);assert.equal(good.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await good.arrayBuffer()),wav);assert.equal(calls,1);
});
test('client cancellation keeps the slot occupied until underlying speech finishes',async t=>{
 let complete,started;const began=new Promise(resolve=>started=resolve);let calls=0;
 const f=await fixture(t,()=>{calls++;started();return new Promise(resolve=>complete=resolve);});
 const abort=new AbortController(),first=f.post({text:'This line will be stopped.'},{signal:abort.signal});await began;abort.abort();await assert.rejects(first);
 const second=await f.post();assert.equal(second.status,429);assert.equal(calls,1);
 complete(wav);await new Promise(resolve=>setImmediate(resolve));
 const later=f.post();await new Promise(resolve=>setTimeout(resolve,25));assert.equal(calls,2);complete(wav);assert.equal((await later).status,200);
});
test('worker failures are sanitized and malformed audio is rejected',async t=>{
 const f=await fixture(t,async()=>{throw Error('private-token transcript path');});
 const response=await f.post();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private-token|transcript|path/);
 const b=await fixture(t,async()=>Buffer.from('invalid'));assert.equal((await b.post()).status,503);
});
test('SSH arguments contain only validated operator fields and request text uses stdin',async()=>{
 const config=validateVoiceConnection({host:'voice-machine',port:2222,helper:'/private/helper.mjs',configuration:'/private/config.json',lock:'/private/voice.lock'});
 assert.throws(()=>validateVoiceConnection({...config,host:'voice;evil'}));assert.throws(()=>validateVoiceConnection({...config,helper:'/x/../evil'}));
 const text='Hello $() `backticks` & world.';let observed;
 const result=synthesizeOverSSH(config,text,{spawnProcess:(program,args,options)=>{
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  child.stdin.on('data',chunk=>observed={program,args,options,body:chunk.toString()});
  child.stdin.on('finish',()=>{child.stdout.end(wav);child.emit('close',0);});return child;
 }});
 assert.deepEqual(await result,wav);assert.equal(observed.options.shell,false);assert.equal(observed.program,'ssh');assert.equal(JSON.parse(observed.body).text,text);assert.ok(observed.args.every(arg=>!arg.includes(text)));
});
test('SSH timeout, oversized result and disconnected helper reject without audio',async()=>{
 for(const mode of ['timeout','oversize','disconnect']){
  let killed=false;
  const pending=synthesizeOverSSH({host:'voice',port:2222,helper:'/helper',configuration:'/config',lock:'/lock'},'hello',{timeoutMs:15,spawnProcess:()=>{
   const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
   child.kill=()=>{killed=true;child.emit('close',null);};
   child.stdin.on('finish',()=>{if(mode==='oversize')child.stdout.write(Buffer.alloc(1_800_001));if(mode==='disconnect')child.emit('close',255);});return child;
  }});
  // Keep the test alive while the transport's deliberately unreferenced timeout runs.
  const keep=setTimeout(()=>{},100);await assert.rejects(pending);clearTimeout(keep);assert.equal(killed,mode!=='disconnect');
 }
});
