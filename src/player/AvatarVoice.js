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
export class AvatarVoice {
	constructor({createAudio=()=>new Audio(),document=globalThis.document,window=globalThis.window,onState=()=>{}}={}) {
		this.createAudio=createAudio;this.document=document;this.window=window;this.onState=onState;this.audio=null;this.serial=0;this.disposed=false;
		this.onVisibility=()=>{if(document?.hidden)this.stop();};this.onHide=()=>this.stop();
		document?.addEventListener('visibilitychange',this.onVisibility);window?.addEventListener('pagehide',this.onHide);
	}
	stop() {
		this.serial++;
		const audio=this.audio;this.audio=null;
		if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();}
		this.onState({playing:false,message:''});
	}
	async speak(id='welcome') {
		if(this.disposed||this.document?.hidden)return false;
		const line=AVATAR_VOICE_LINES.find(line=>line.id===id);if(!line)return false;
		this.stop();const serial=this.serial;
		try {
			const audio=this.createAudio();this.audio=audio;audio.preload='none';audio.src=line.url;audio.volume=1;
			const fail=()=>{if(this.serial===serial){this.stop();this.onState({playing:false,message:'Could not play this line. Try Speak again.'});}};
			audio.onended=()=>{if(this.serial===serial)this.stop();};audio.onerror=fail;
			this.onState({playing:true,message:'Speaking: '+line.label});
			await audio.play();return this.serial===serial;
		} catch {if(this.serial===serial){this.stop();this.onState({playing:false,message:'Could not play this line. Try Speak again.'});}return false;}
	}
	dispose() {this.stop();this.disposed=true;this.document?.removeEventListener('visibilitychange',this.onVisibility);this.window?.removeEventListener('pagehide',this.onHide);}
}
