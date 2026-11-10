import test from 'node:test';
import assert from 'node:assert/strict';
import {transferDeadline} from '../src/util/TransferDeadline.js';
import {hostedRepositorySource} from '../src/world-runtime/HostedRepository.js';
import {loadPinnedMicroduck} from '../src/npc/RigidCharacterVisual.js';
import {readFile} from 'node:fs/promises';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const options={origin:'https://example.test',baseURL:'https://example.test/worlds.html',timeoutMs:10};
const assetPath='native-island/'+'a'.repeat(64)+'.bin';

test('large transfer renews only nonempty progress, with an absolute total cap',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const deadline=transferDeadline(10,{progressive:true});
 for(let i=0;i<8;i++){t.mock.timers.tick(9);deadline.progress(1);assert.equal(deadline.signal.aborted,false);}
 t.mock.timers.tick(8);assert.equal(deadline.signal.aborted,true);deadline.dispose();
 const empty=transferDeadline(10,{progressive:true});t.mock.timers.tick(9);empty.progress(0);t.mock.timers.tick(1);assert.equal(empty.signal.aborted,true);empty.dispose();
 const small=transferDeadline(10);t.mock.timers.tick(9);small.progress(100);t.mock.timers.tick(1);assert.equal(small.signal.aborted,true);small.dispose();
});

test('large transfer total deadline is never more than 120 seconds',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const deadline=transferDeadline(30000,{progressive:true});
 for(let i=0;i<5;i++){t.mock.timers.tick(20000);deadline.progress(1);assert.equal(deadline.signal.aborted,false);}
 t.mock.timers.tick(20000);assert.equal(deadline.signal.aborted,true);deadline.dispose();
});

test('deadline disposal clears timers and external abort is respected',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const external=new AbortController(),deadline=transferDeadline(10,{progressive:true,signal:external.signal});
 const waiting=deadline.wait(()=>new Promise(()=>{}));const rejected=assert.rejects(waiting,/caller cancelled/);external.abort(Error('caller cancelled'));await rejected;deadline.dispose();
 const disposed=transferDeadline(10,{progressive:true});disposed.dispose();t.mock.timers.tick(1000);assert.equal(disposed.signal.aborted,true);
});

function controlledBody(){
 let next,cancelled=0,released=0;
 const reader={read:()=>new Promise(resolve=>{next=resolve;}),cancel:async()=>{cancelled++;},releaseLock:()=>{released++;}};
 return {body:{getReader:()=>reader},send(value){assert.ok(next);const resolve=next;next=null;resolve(value);},get cancelled(){return cancelled;},get released(){return released;}};
}

test('hosted large decoded bodies can progress beyond the old total deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const stream=controlledBody();
 const source=hostedRepositorySource('/world/',{...options,fetch:async()=>({ok:true,headers:new Headers({'content-length':'1','content-encoding':'gzip'}),body:stream.body})});
 const pending=source.read(assetPath,16*1024*1024);await flush();
 for(const value of [new Uint8Array([1]),new Uint8Array([2]),new Uint8Array([3])]){t.mock.timers.tick(9);stream.send({done:false,value});await flush();}
 stream.send({done:true});assert.deepEqual(await pending,new Uint8Array([1,2,3]));assert.equal(stream.cancelled,1);assert.equal(stream.released,1);
});

test('hosted body stalls and caller cancellation clean up, then permit retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let stream=controlledBody();
 const source=hostedRepositorySource('/world/',{...options,fetch:async()=>({ok:true,headers:new Headers(),body:stream.body})});
 const pending=source.read(assetPath,16*1024*1024),rejected=assert.rejects(pending,/deadline exceeded/);await flush();t.mock.timers.tick(9);stream.send({done:false,value:new Uint8Array([1])});await flush();t.mock.timers.tick(10);await rejected;assert.equal(stream.cancelled,1);assert.equal(stream.released,1);
 stream=controlledBody();const caller=new AbortController(),retry=source.read(assetPath,16*1024*1024,{signal:caller.signal}),cancelled=assert.rejects(retry,/caller stopped/);await flush();caller.abort(Error('caller stopped'));await cancelled;assert.equal(stream.cancelled,1);assert.equal(stream.released,1);
 stream=controlledBody();const success=source.read(assetPath,16*1024*1024);await flush();stream.send({done:true});assert.equal((await success).length,0);
});

test('pinned companion progresses beyond its old timeout without weakening integrity',async t=>{
 const bytes=await readFile(new URL('../public/models/microduck/microduck-realtime.glb',import.meta.url));
 t.mock.timers.enable({apis:['setTimeout']});const stream=controlledBody();
 const pending=loadPinnedMicroduck('progressive-companion-test',{timeoutMs:10,fetcher:async()=>({ok:true,body:stream.body})});await flush();
 for(let offset=0;offset<bytes.length;offset+=2500000){t.mock.timers.tick(9);stream.send({done:false,value:bytes.subarray(offset,offset+2500000)});await flush();}
 stream.send({done:true});const data=await pending;assert.equal(data.nodes.length,114);assert.equal(stream.cancelled,1);assert.equal(stream.released,1);
});

test('pinned companion failed transfer is evicted for retry and accepts caller abort',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let stream=controlledBody();const fetcher=async()=>({ok:true,body:stream.body});
 const first=loadPinnedMicroduck('retry-companion-test',{timeoutMs:10,fetcher}),rejected=assert.rejects(first,/deadline exceeded/);await flush();t.mock.timers.tick(10);await rejected;assert.equal(stream.cancelled,1);
 stream=controlledBody();const caller=new AbortController(),second=loadPinnedMicroduck('retry-companion-test',{timeoutMs:10,fetcher,signal:caller.signal}),cancelled=assert.rejects(second,/caller stopped/);assert.notEqual(first,second);await flush();caller.abort(Error('caller stopped'));await cancelled;assert.equal(stream.cancelled,1);assert.equal(stream.released,1);
});

test('independently aborted companion consumers cannot cancel shared default loads',async t=>{
 const bytes=await readFile(new URL('../public/models/microduck/microduck-realtime.glb',import.meta.url));
 t.mock.timers.enable({apis:['setTimeout']});const streams=[controlledBody(),controlledBody(),controlledBody()];let calls=0;
 const fetcher=async()=>({ok:true,body:streams[calls++].body}),url='concurrent-companion-test';
 const shared=loadPinnedMicroduck(url,{timeoutMs:10,fetcher});assert.equal(loadPinnedMicroduck(url,{timeoutMs:10,fetcher}),shared);
 const first=new AbortController(),second=new AbortController();
 const isolated=loadPinnedMicroduck(url,{timeoutMs:10,fetcher,signal:first.signal}),other=loadPinnedMicroduck(url,{timeoutMs:10,fetcher,signal:second.signal});
 const rejected=assert.rejects(isolated,/one consumer stopped/);await flush();assert.equal(calls,3);first.abort(Error('one consumer stopped'));await rejected;
 for(const stream of [streams[0],streams[2]]){stream.send({done:false,value:bytes});}await flush();
 for(const stream of [streams[0],streams[2]]){stream.send({done:true});}
 assert.equal((await shared).nodes.length,114);assert.equal((await other).nodes.length,114);assert.equal(streams[1].cancelled,1);
});
