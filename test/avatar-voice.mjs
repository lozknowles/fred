import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {AvatarVoice,AVATAR_VOICE_LINES,canSpeakAvatarKey,loadAvatarVoiceLine,saveAvatarVoiceLine} from '../src/player/AvatarVoice.js';

function surface(){const listeners=new Map();return {hidden:false,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),emit:key=>listeners.get(key)?.(),listeners};}
function fixture(play=()=>Promise.resolve()) {
	const document=surface(),window=surface(),audios=[],states=[];
	const voice=new AvatarVoice({document,window,onState:state=>states.push(state),createAudio:()=>{const audio={pauseCount:0,releaseCount:0,loadCount:0,play,pause(){this.pauseCount++;},removeAttribute(name){assert.equal(name,'src');delete this.src;this.releaseCount++;},load(){this.loadCount++;}};audios.push(audio);return audio;}});
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
