import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {AvatarVoice,AVATAR_VOICE_LINES,canSpeakAvatarKey,loadAvatarVoiceLine,saveAvatarVoiceLine} from '../src/player/AvatarVoice.js';

function surface(){const listeners=new Map();return {hidden:false,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),emit:key=>listeners.get(key)?.(),listeners};}
function fixture(play=()=>Promise.resolve(),extra={}) {
	const document=surface(),window=surface(),audios=[],states=[];
	const voice=new AvatarVoice({...extra,document,window,onState:state=>states.push(state),createAudio:()=>{const audio={pauseCount:0,releaseCount:0,loadCount:0,play,pause(){this.pauseCount++;},removeAttribute(name){assert.equal(name,'src');delete this.src;this.releaseCount++;},load(){this.loadCount++;}};audios.push(audio);return audio;}});
	return {voice,document,window,audios,states};
}
test('five local MP3 assets resolve in Node without constructing audio or fetching',()=>{
	const f=fixture();assert.equal(f.audios.length,0);
	assert.equal(AVATAR_VOICE_LINES.length,5);
	for(const line of AVATAR_VOICE_LINES){assert.equal(new URL(line.url).protocol,'file:');assert.ok(existsSync(new URL(line.url)));}
	f.voice.dispose();
});
test('playback replacement and end release the prior source without overlapping speech',async()=>{
	const f=fixture();assert.equal(await f.voice.speak('welcome'),true);const first=f.audios[0];
	assert.equal(await f.voice.speak('dock'),true);assert.equal(first.pauseCount,1);assert.equal(first.releaseCount,1);
	const current=f.audios[1];current.onended();assert.equal(current.releaseCount,1);assert.equal(f.voice.audio,null);f.voice.dispose();
});
test('hide, pagehide and disposal stop audio and remove all lifecycle listeners',async()=>{
	const f=fixture();await f.voice.speak();f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.audios[0].releaseCount,1);
	assert.equal(await f.voice.speak(),false);assert.equal(f.audios.length,1);
	f.document.hidden=false;await f.voice.speak();f.window.emit('pagehide');assert.equal(f.audios[1].releaseCount,1);
	f.voice.dispose();assert.equal(f.document.listeners.size,0);assert.equal(f.window.listeners.size,0);assert.equal(await f.voice.speak(),false);
});
test('rejected old playback cannot stop a newer line or write stale errors',async()=>{
	let reject;const f=fixture(()=>new Promise((_,r)=>{reject=r;}));const old=f.voice.speak();const rejectOld=reject;
	f.voice.createAudio=()=>{const audio={play:()=>Promise.resolve(),pause(){},removeAttribute(){},load(){}};f.audios.push(audio);return audio;};
	await f.voice.speak('c64');const current=f.voice.audio;rejectOld(Error('old abort'));assert.equal(await old,false);assert.equal(f.voice.audio,current);assert.equal(f.states.at(-1).playing,true);f.voice.dispose();
});
test('blocked playback has an accessible actionable message and releases media',async()=>{
	const f=fixture(()=>Promise.reject(Error('blocked')));assert.equal(await f.voice.speak(),false);assert.match(f.states.at(-1).message,/Try Speak again/);assert.equal(f.audios[0].releaseCount,1);f.voice.dispose();
});
test('J only accepts a fresh trusted gameplay key outside focused controls and dialogs',()=>{
	const doc={hidden:false,querySelector:()=>null,activeElement:null};const event={code:'KeyJ',isTrusted:true,target:null};
	assert.equal(canSpeakAvatarKey(event,true,doc),true);assert.equal(canSpeakAvatarKey(event,false,doc),false);
	for(const prop of ['repeat','isComposing','defaultPrevented','altKey','ctrlKey','metaKey','shiftKey'])assert.equal(canSpeakAvatarKey({...event,[prop]:true},true,doc),false,prop);
	assert.equal(canSpeakAvatarKey({...event,isTrusted:false},true,doc),false);
	assert.equal(canSpeakAvatarKey({...event,code:'KeyK'},true,doc),false);
	assert.equal(canSpeakAvatarKey(event,true,{...doc,hidden:true}),false);
	assert.equal(canSpeakAvatarKey(event,true,{...doc,querySelector:()=>({})}),false);
	assert.equal(canSpeakAvatarKey({...event,target:{isContentEditable:true}},true,doc),false);
	assert.equal(canSpeakAvatarKey(event,true,{...doc,activeElement:{closest:()=>({})}}),false);
});
test('selection accepts only fixed IDs and gracefully handles unavailable storage',()=>{
	let saved;const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
	assert.equal(loadAvatarVoiceLine(storage),'welcome');assert.equal(saveAvatarVoiceLine('dock',storage),true);assert.equal(loadAvatarVoiceLine(storage),'dock');
	assert.equal(saveAvatarVoiceLine('free text',storage),false);assert.equal(saved,'dock');saved='unknown';assert.equal(loadAvatarVoiceLine(storage),'welcome');
	const denied={getItem(){throw Error();},setItem(){throw Error();}};assert.equal(loadAvatarVoiceLine(denied),'welcome');assert.equal(saveAvatarVoiceLine('dock',denied),false);
});

const session=()=>Response.json({available:true,token:'session-token',maxCharacters:180});
const wav=(size=16)=>new Response(new Uint8Array(size),{headers:{'Content-Type':'audio/wav'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function typedFixture(play,fetch){const made=[],revoked=[];const f=fixture(play,{fetch,urls:{createObjectURL(blob){made.push(blob);return 'blob:'+made.length;},revokeObjectURL(url){revoked.push(url);}}});return {...f,made,revoked};}

test('typed text validates locally, does not fetch at startup and sends only cleaned text and token',async()=>{
 const calls=[];const f=typedFixture(undefined,async(url,options)=>{calls.push({url,options});return url.endsWith('/session')?session():wav();});
 assert.equal(calls.length,0);
 for(const invalid of ['', '   ',null,'x'.repeat(181)])assert.equal(await f.voice.speakTyped(invalid),false);
 assert.equal(calls.length,0);
 assert.equal(await f.voice.speakTyped('  hello\nworld  '),true);
 assert.equal(calls.length,2);assert.equal(calls[0].url,'/api/avatar-voice/session');
 assert.deepEqual(JSON.parse(calls[1].options.body),{text:'hello world'});
 assert.equal(calls[1].options.headers['X-Fred-Voice-Token'],'session-token');
 assert.equal(f.states.at(-1).phase,'playing');f.voice.stop();assert.deepEqual(f.revoked,['blob:1']);
 await f.voice.replay('dock');assert.equal(calls.length,2);assert.equal(f.made.length,2);f.voice.dispose();assert.equal(f.voice.generated,null);assert.deepEqual(f.revoked,['blob:1','blob:2']);
});

test('Stop cancels generation and suppresses late session results',async()=>{
 let resolve,signal,calls=0;const f=typedFixture(undefined,(_url,options)=>{calls++;signal=options.signal;return new Promise(r=>{resolve=r;});});
 const pending=f.voice.speakTyped('hello');assert.equal(f.states.at(-1).generating,true);f.voice.stop();assert.equal(signal.aborted,true);
 resolve(session());assert.equal(await pending,false);assert.equal(calls,1);assert.equal(f.audios.length,0);f.voice.dispose();
});

test('replacement, hide and dispose prevent a late POST from playing or changing state',async()=>{
 for(const action of ['replace','hide','dispose']){
  let resolve,signal;const f=typedFixture(undefined,async(url,options)=>{if(url.endsWith('/session'))return session();signal=options.signal;return new Promise(r=>{resolve=r;});});
  const pending=f.voice.speakTyped('hello');await tick();
  if(action==='replace')await f.voice.speak('c64');
  if(action==='hide'){f.document.hidden=true;f.document.emit('visibilitychange');}
  if(action==='dispose')f.voice.dispose();
  const state=f.states.at(-1);assert.equal(signal.aborted,true);resolve(wav());assert.equal(await pending,false);
  assert.equal(f.states.at(-1),state);assert.equal(f.made.length,0);assert.equal(f.audios.length,action==='replace'?1:0);f.voice.dispose();
 }
});

test('blocked generated playback retains bytes for trusted retry without another request',async()=>{
 let count=0;const error=new Error('blocked');error.name='NotAllowedError';
 const f=typedFixture(()=>Promise.reject(error),async(url)=>{count++;return url.endsWith('/session')?session():wav();});
 assert.equal(await f.voice.speakTyped('hello'),false);assert.equal(f.states.at(-1).phase,'ready');assert.equal(f.states.at(-1).ready,true);assert.equal(f.revoked.length,1);
 f.voice.createAudio=()=>({play:()=>Promise.resolve(),pause(){},removeAttribute(){},load(){}});
 assert.equal(await f.voice.playTyped(),true);assert.equal(count,2);f.voice.dispose();
});

test('oversized, empty and wrong media responses never create playback objects',async()=>{
 const responses=[()=>wav(1800001),()=>new Response('bad',{headers:{'Content-Type':'audio/wav','Content-Length':'1800001'}}),()=>wav(0),()=>new Response('html',{headers:{'Content-Type':'text/html'}})];
 for(const response of responses){const f=typedFixture(undefined,async url=>url.endsWith('/session')?session():response());assert.equal(await f.voice.speakTyped('hello'),false);assert.equal(f.made.length,0);assert.equal(f.audios.length,0);assert.equal(f.states.at(-1).phase,'error');f.voice.dispose();}
});

test('busy and unavailable responses report safe messages without provider contents',async()=>{
 for(const status of [429,502,503,504]){const f=typedFixture(undefined,async url=>url.endsWith('/session')?session():Response.json({error:'private provider details'},{status}));await f.voice.speakTyped('hello');assert.doesNotMatch(f.states.at(-1).message,/private/);assert.match(f.states.at(-1).message,status===429?/busy/:/unavailable/);f.voice.dispose();}
});

test('chooser retains quick clip persistence and stops speech on save and close without storing typed draft',()=>{
 const source=readFileSync(new URL('../src/player/AvatarChooser.js',import.meta.url),'utf8');
 assert.match(source,/maxlength="180"/);assert.match(source,/voice\.speakTyped\(section\.querySelector\('textarea'\)\.value\)/);
 assert.match(source,/this\.voiceLine=this\.voiceSelect\.value; saveAvatarVoiceLine\(this\.voiceLine\)/);
 assert.match(source,/this\.voice\.stop\(\);\s*this\.saving=true/);
 assert.match(source,/addEventListener\('close',\(\)=>this\.voice\.stop\(\)\)/);
 assert.match(source,/speakVoice\(\) \{return this\.voice\.replay\(this\.voiceLine\)/);
 assert.doesNotMatch(source,/setItem\([^\n]*voice-text/);
});

test('typed playback rejection after replacement cannot interrupt current quick clip',async()=>{
 let reject;const f=typedFixture(()=>new Promise((_,r)=>{reject=r;}),async url=>url.endsWith('/session')?session():wav());
 const pending=f.voice.speakTyped('hello');await tick();const oldReject=reject;
 f.voice.createAudio=()=>({play:()=>Promise.resolve(),pause(){},removeAttribute(){},load(){}});
 await f.voice.speak('dock');const current=f.voice.audio;oldReject(Error('old playback'));assert.equal(await pending,false);
 assert.equal(f.voice.audio,current);assert.equal(f.states.at(-1).phase,'playing');assert.equal(f.revoked.length,1);f.voice.dispose();
});

test('Stop during streamed response suppresses bytes and prevents stale autoplay',async()=>{
 let stream;let cancelled=false;const f=typedFixture(undefined,async url=>url.endsWith('/session')?session():new Response(new ReadableStream({start(controller){stream=controller;},cancel(){cancelled=true;}}),{headers:{'Content-Type':'audio/wav'}}));
 const pending=f.voice.speakTyped('hello');await tick();f.voice.stop();stream.enqueue(new Uint8Array(16));
 assert.equal(await pending,false);assert.equal(cancelled,true);assert.equal(f.made.length,0);assert.equal(f.audios.length,0);f.voice.dispose();
});

test('180 cleaned characters are accepted and unavailable session never posts',async()=>{
 let calls=0;const f=typedFixture(undefined,async url=>{calls++;return url.endsWith('/session')?session():wav();});
 assert.equal(await f.voice.speakTyped('x'.repeat(180)),true);assert.equal(calls,2);f.voice.dispose();
 const off=typedFixture(undefined,async()=>{calls++;return Response.json({available:false,message:'secret internal detail'});});
 await off.voice.speakTyped('hello');assert.equal(calls,3);assert.match(off.states.at(-1).message,/unavailable/);assert.doesNotMatch(off.states.at(-1).message,/secret/);off.voice.dispose();
});
