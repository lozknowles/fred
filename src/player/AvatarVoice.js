import {cleanSpeechText,MAX_SPEECH_LENGTH} from '../network/SpeechText.js';
// Fixed, owner-authorised lines. Audio is created only after a playback request.
export const AVATAR_VOICE_LINES = Object.freeze([
	{id:'welcome',label:'Welcome to my Warehouse',url:new URL('./voice/avatar-welcome.mp3',import.meta.url).href},
	{id:'warehouse',label:'Warehouse television',url:new URL('./voice/tour-warehouse.mp3',import.meta.url).href},
	{id:'c64',label:'Commodore 64 greeting',url:new URL('./voice/tour-c64.mp3',import.meta.url).href},
	{id:'portals',label:'Stairs and Neon Shift portal',url:new URL('./voice/tour-portals.mp3',import.meta.url).href},
	{id:'dock',label:'Explore the Dock',url:new URL('./voice/tour-dock.mp3',import.meta.url).href},
]);
const key='fred.avatar.voice.line';
export function loadAvatarVoiceLine(storage) {
	try { storage??=globalThis.localStorage;const id=storage?.getItem(key); return AVATAR_VOICE_LINES.some(line=>line.id===id)?id:'welcome'; } catch { return 'welcome'; }
}
export function saveAvatarVoiceLine(id,storage) {
	if(!AVATAR_VOICE_LINES.some(line=>line.id===id))return false;
	try { storage??=globalThis.localStorage;storage?.setItem(key,id); return !!storage; } catch { return false; }
}
export function canSpeakAvatarKey(event,ready,doc=globalThis.document) {
	if(event.code!=='KeyJ'||!event.isTrusted||event.repeat||event.isComposing||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!ready||doc?.hidden)return false;
	if(doc?.querySelector?.('dialog[open]'))return false;
	const editable=node=>node?.isContentEditable||node?.closest?.('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
	return !editable(event.target)&&!editable(doc?.activeElement);
}
// Keep validation shared with network speech, but never send identity fields.
export const AVATAR_VOICE_MAX_CHARACTERS=MAX_SPEECH_LENGTH;
export const AVATAR_VOICE_MAX_BYTES=1800000;
export class AvatarVoice {
	constructor({createAudio=()=>new Audio(),fetch=globalThis.fetch,urls=globalThis.URL,document=globalThis.document,window=globalThis.window,onState=()=>{}}={}) {
		Object.assign(this,{createAudio,fetch,urls,document,window,onState});
		this.audio=null;this.serial=0;this.disposed=false;this.controller=null;this.objectURL=null;this.generated=null;this.replayTyped=false;
		this.onVisibility=()=>{if(document?.hidden)this.stop();};this.onHide=()=>this.stop();
		document?.addEventListener('visibilitychange',this.onVisibility);window?.addEventListener('pagehide',this.onHide);
	}
	state(phase,message='') {this.onState({phase,playing:phase==='playing',generating:phase==='generating',ready:!!this.generated,message});}
	stop() {
		this.serial++;this.controller?.abort();this.controller=null;
		const audio=this.audio;this.audio=null;
		if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();}
		if(this.objectURL){this.urls.revokeObjectURL(this.objectURL);this.objectURL=null;}
		this.state(this.generated?'ready':'idle',this.generated?'Ready. Play typed line or press J while exploring.':'');
	}
	async playSource(source,label,serial,typed=false) {
		try {
			const audio=this.createAudio();this.audio=audio;audio.preload='none';audio.src=source;audio.volume=1;
			const fail=()=>{if(this.serial===serial){this.stop();this.state('error',typed?'Could not play. Try Play typed line again.':'Could not play this line. Try Speak again.');}};
			audio.onended=()=>{if(this.serial===serial)this.stop();};audio.onerror=fail;
			this.state('playing','Speaking: '+label);
			await audio.play();return this.serial===serial;
		} catch(error) {
			if(this.serial===serial){this.stop();this.state(typed&&error?.name==='NotAllowedError'?'ready':'error',typed?'Ready. Press Play typed line to hear it.':'Could not play this line. Try Speak again.');}
			return false;
		}
	}
	async speak(id='welcome') {
		if(this.disposed||this.document?.hidden)return false;
		const line=AVATAR_VOICE_LINES.find(line=>line.id===id);if(!line)return false;
		this.stop();this.replayTyped=false;
		return this.playSource(line.url,line.label,this.serial);
	}
	async playTyped() {
		if(this.disposed||this.document?.hidden||!this.generated)return false;
		this.stop();this.replayTyped=true;
		try {this.objectURL=this.urls.createObjectURL(this.generated);}
		catch {this.state('error','Could not prepare audio. Try Speak typed text again.');return false;}
		return this.playSource(this.objectURL,'typed line',this.serial,true);
	}
	replay(id='welcome') {return this.replayTyped&&this.generated?this.playTyped():this.speak(id);}
	async speakTyped(input) {
		if(this.disposed||this.document?.hidden)return false;
		this.stop();
		const text=cleanSpeechText(input);
		if(!text||text.length>AVATAR_VOICE_MAX_CHARACTERS){this.state('error','Enter 1–180 characters to speak.');return false;}
		const serial=this.serial,controller=new AbortController();this.controller=controller;
		const current=()=>this.serial===serial&&!this.disposed&&!this.document?.hidden;
		this.state('generating','Generating your typed line…');
		try {
			const options={signal:controller.signal,credentials:'same-origin',cache:'no-store'};
			const sessionResponse=await this.fetch('/api/avatar-voice/session',options);
			if(!current())return false;
			if(!sessionResponse.ok)throw Error('unavailable');
			const session=await sessionResponse.json();
			if(!current())return false;
			if(session.available!==true||typeof session.token!=='string'||!session.token)throw Error('unavailable');
			const response=await this.fetch('/api/avatar-voice',{...options,method:'POST',headers:{'Content-Type':'application/json','X-Fred-Voice-Token':session.token},body:JSON.stringify({text})});
			if(!current())return false;
			if(!response.ok)throw Error(response.status===429?'busy':'unavailable');
			if(!/^audio\/wav(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('invalid');
			if(Number(response.headers.get('content-length'))>AVATAR_VOICE_MAX_BYTES)throw Error('oversized');
			const reader=response.body?.getReader();if(!reader)throw Error('invalid');
			const chunks=[];let size=0;
			try {while(true){const {done,value}=await reader.read();if(!current()){await reader.cancel();return false;}if(done)break;size+=value.byteLength;if(size>AVATAR_VOICE_MAX_BYTES){await reader.cancel();throw Error('oversized');}chunks.push(value);}}
			finally {reader.releaseLock();}
			if(!size)throw Error('invalid');
			if(!current())return false;
			this.generated=new Blob(chunks,{type:'audio/wav'});this.controller=null;
			return this.playTyped();
		} catch(error) {
			if(current()){controller.abort();this.controller=null;this.state('error',error.message==='busy'?'Voice is busy. Try again shortly.':'Typed voice is unavailable. Please try again.');}
			return false;
		}
	}
	dispose() {this.stop();this.disposed=true;this.generated=null;this.replayTyped=false;this.document?.removeEventListener('visibilitychange',this.onVisibility);this.window?.removeEventListener('pagehide',this.onHide);this.state('idle');}
}
