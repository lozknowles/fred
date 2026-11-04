import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const version='test-voice-worker/1';
const token='local-test-token-only-'.padEnd(40,'x');
const representation=Buffer.from('test representation only');
const helper=fileURLToPath(new URL('../tools/avatar-voice-worker.mjs',import.meta.url));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const bounded=(promise,ms=5000)=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('local worker test timed out')),ms);timer.unref();})]);
function wav(size=44){const bytes=Buffer.alloc(size);bytes.write('RIFF');bytes.writeUInt32LE(size-8,4);bytes.write('WAVE',8);return bytes;}

// HTTP requests are accepted concurrently by Node, but response handlers run in
// one explicit queue, matching the deployed synchronous HTTPServer worker.
async function fixture({healthVersion=version,responseVersion=version,audio=wav()}={}){
 const directory=await mkdtemp(join(tmpdir(),'fred-voice-worker-'));
 const events=[],healthArrived=deferred(),priorStarted=deferred(),priorRelease=deferred();
 let queue=Promise.resolve(),child;
 const server=http.createServer((request,response)=>{
  const chunks=[];
  request.on('data',chunk=>chunks.push(chunk));
  request.on('end',()=>{
   const path=request.url;
   events.push({event:'arrived',path});
   if(path==='/voice-lab/health')healthArrived.resolve();
   queue=queue.then(async()=>{
    events.push({event:'start',path});
    assert.equal(request.headers.authorization,'Bearer '+token);
    if(path==='/prior-inference'){
     priorStarted.resolve();await priorRelease.promise;
     events.push({event:'finished',path});response.end('prior inference done');return;
    }
    response.setHeader('content-type','application/json');
    if(path==='/voice-lab/health'){
     response.end(JSON.stringify({available:true,version:healthVersion,shared_existing_model:true}));
     events.push({event:'health-complete',path});
    }else if(path==='/voice-lab/synthesize'){
     const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     events.push({event:'synthesize',body});
     response.end(JSON.stringify({version:responseVersion,audio:audio.toString('base64')}));
    }else{response.statusCode=404;response.end('{}');}
   }).catch(error=>{response.destroy(error);});
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint='http://127.0.0.1:'+server.address().port;
 const configPath=join(directory,'config.json'),profilePath=join(directory,'profile.json'),tokenPath=join(directory,'token');
 await Promise.all([
  writeFile(profilePath,JSON.stringify({display_name:'loz',qualification_status:'ACCEPTED',user_acceptance:true,voice_representation_hash:createHash('sha256').update(representation).digest('hex'),provider_version:version,profile_id:'test-profile'})),
  writeFile(join(directory,'representation.bin'),representation),writeFile(tokenPath,token),
  writeFile(configPath,JSON.stringify({endpoint,profilePath,tokenPath})),
 ]);
 function run(text){
  child=spawn(process.execPath,[helper,configPath],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const stdout=[],stderr=[];
  child.stdout.on('data',chunk=>stdout.push(chunk));child.stderr.on('data',chunk=>stderr.push(chunk));
  const result=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve({code,stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr).toString('utf8')}));});
  child.stdin.end(JSON.stringify({text}));return bounded(result);
 }
 return {endpoint,events,healthArrived,priorStarted,priorRelease,run,async close(){priorRelease.resolve();child?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}};
}

test('child helper waits for prior canceled inference to finish before probing readiness and submitting normalized text',{timeout:10000},async()=>{
 const f=await fixture();const controller=new AbortController();
 try{
  const prior=fetch(f.endpoint+'/prior-inference',{headers:{authorization:'Bearer '+token},signal:controller.signal}).catch(error=>error);
  await bounded(f.priorStarted.promise);controller.abort();await prior;
  const result=f.run('  Hello\n\tprivate   world!  ');
  await bounded(f.healthArrived.promise);
  assert.equal(f.events.some(item=>item.event==='synthesize'),false);
  assert.equal(f.events.some(item=>item.event==='start'&&item.path==='/voice-lab/health'),false);
  f.priorRelease.resolve();
  const completed=await result;assert.equal(completed.code,0);assert.equal(completed.stderr,'');assert.deepEqual(completed.stdout,wav());
  const finished=f.events.findIndex(item=>item.event==='finished');
  const health=f.events.findIndex(item=>item.event==='start'&&item.path==='/voice-lab/health');
  const healthComplete=f.events.findIndex(item=>item.event==='health-complete');
  const synthesis=f.events.findIndex(item=>item.event==='synthesize');
  assert.ok(finished>=0&&health>finished&&healthComplete>health&&synthesis>healthComplete);
  assert.deepEqual(f.events[synthesis].body,{representation:representation.toString('base64'),version,text:'Hello private world!'});
 }finally{await f.close();}
});

test('child helper refuses mismatched health version without submitting synthesis',{timeout:10000},async()=>{
 const f=await fixture({healthVersion:'unexpected-worker/2'});
 try{const result=await f.run('hello');assert.equal(result.code,1);assert.equal(result.stdout.length,0);assert.equal(result.stderr,'Private voice request could not complete.\n');assert.equal(f.events.some(item=>item.event==='synthesize'),false);}finally{await f.close();}
});

test('child helper validates response identity and exact WAV upper bound',{timeout:20000},async()=>{
 for(const scenario of [
  {responseVersion:'unexpected-worker/2',audio:wav(),accepted:false},
  {audio:wav(1800000),accepted:true},
  {audio:wav(1800001),accepted:false},
 ]){
  const f=await fixture(scenario);
  try{const result=await f.run('bounded test');assert.equal(result.code,scenario.accepted?0:1);assert.equal(result.stdout.length,scenario.accepted?1800000:0);assert.equal(result.stderr,scenario.accepted?'':'Private voice request could not complete.\n');assert.equal(f.events.filter(item=>item.event==='synthesize').length,1);}finally{await f.close();}
 }
});
