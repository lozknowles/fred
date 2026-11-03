import { AVATAR_STYLES, loadAppearance, saveAppearance } from './AvatarAppearance.js';
import { AvatarVoice, AVATAR_VOICE_LINES, loadAvatarVoiceLine, saveAvatarVoiceLine } from './AvatarVoice.js';
import { loadFacePhoto, saveFacePhoto, removeFacePhoto, subscribeFacePhoto, decodeFacePhoto, encodeFacePhoto, loadFacePhotoImage } from './AvatarFacePhotoStore.js';

const palettes = {
	shirt: ['#7194aa','#c54343','#33785b','#e8c653','#f2eee3','#343642'],
	trousers: ['#27313d','#565b67','#99724c','#294e70','#e2d9c5','#292526'],
	skin: ['#f1c7a5','#dfae87','#c68c67','#a26946','#805136','#513323'],
	hair: ['#171512','#33251c','#754a2e','#a95732','#d8b779','#adadab'],
};
let styled = false;
// Persist only after all asynchronous rendering work has succeeded. A failed
// storage write leaves the old durable photo intact and restores its live view.
export async function commitAvatarDraft({ready,apply,persist,restore}) {
	const rollback=async()=>{
		try { await restore(); }
		catch(cause) { throw new Error('Save failed and the character preview could not be restored. Your saved photo is unchanged. Reopen the avatar chooser to retry.',{cause}); }
	};
	try { await ready(); await apply(); }
	catch(cause) { await rollback(); throw new Error('Could not load this character or face photo. Please try again.',{cause}); }
	try { persist(); }
	catch(cause) { await rollback(); throw new Error('Photo could not be saved in browser storage. Your previous saved photo was restored. Free browser storage and try again.',{cause}); }
}
// Only the owner's chooser is wired to browser storage. Remote avatar instances
// never read the owner's photo or carry it in their appearance packet.
export function attachLocalFacePhotoStore(chooser, read=loadFacePhoto, subscribe=subscribeFacePhoto) {
	if (!chooser.app?.avatar) return () => {};
	const restore = () => {
		if (chooser.dialog.open) return;
		chooser.faceDraft = read();
		chooser.updateFacePreview();
	};
	const unsubscribe=subscribe(restore);
	restore();
	return unsubscribe;
}
export class AvatarChooser {
	constructor({ app = null, parent = document.body } = {}) {
		this.app = app; this.value = loadAppearance(); this.faceRevision=0; this.faceTask=Promise.resolve(); this.faceBusy=false;
		try { this.name = localStorage.getItem('elsemesh.avatar.name') || 'Explorer'; } catch { this.name = 'Explorer'; }
		if(app) app.player.displayName = this.name;
		if (app) { app.player.avatarAppearance = { ...this.value }; app.avatar.setAppearance(this.value)?.catch(() => {}); }
		if (!styled) {
			styled = true;
			const style = document.createElement('style');
			style.textContent = `.elsemesh-avatar-open{position:fixed;bottom:22px;left:22px;z-index:1150;border:1px solid #87d9cf;border-radius:24px;padding:10px 18px;background:#09252de8;color:#efffff;cursor:pointer;font:600 14px system-ui}.elsemesh-avatar-dialog{background:#091f2b;color:#edfaf8;border:1px solid #6cabae;border-radius:18px;padding:24px;width:min(420px,94vw);max-height:90vh;overflow:auto;font:15px/1.5 system-ui}.elsemesh-avatar-dialog::backdrop{background:#06101680}.elsemesh-avatar-dialog h2{margin:0 0 8px}.elsemesh-avatar-dialog p{color:#b2cccf;font-size:13px}.elsemesh-avatar-dialog label{display:block;margin:12px 0 5px}.elsemesh-avatar-dialog select{width:100%;padding:10px;background:#153845;color:white;border:1px solid #62959a;border-radius:8px}.elsemesh-avatar-dialog img{float:right;width:90px;height:128px;object-fit:contain;background:#cbd2d5;border-radius:8px;margin:8px}.elsemesh-avatar-colours{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.elsemesh-avatar-colours button{width:30px;height:30px;padding:0;border:2px solid #86999d;border-radius:50%;cursor:pointer;margin:0}.elsemesh-avatar-colours button[aria-pressed=true]{outline:2px solid white;outline-offset:2px}.elsemesh-avatar-colours input{width:38px;height:32px;padding:2px;border:0;background:transparent}.elsemesh-avatar-actions{display:flex;gap:12px;margin-top:20px}.elsemesh-avatar-actions button{padding:10px 16px;border:0;border-radius:8px;background:#70dbcf;color:#09242b;font-weight:700;cursor:pointer}.elsemesh-avatar-dialog.game{margin-right:20px}.elsemesh-avatar-dialog.game::backdrop{background:transparent}@media(max-width:650px){.elsemesh-avatar-dialog.game{margin:auto}}`;
			document.head.append(style);
		}
		this.button = document.createElement('button'); this.button.textContent = app ? 'Avatar · K' : 'Choose your avatar';
		if (app) this.button.className = 'elsemesh-avatar-open';
		parent.append(this.button); this.button.onclick = () => this.show();
		this.dialog = document.createElement('dialog'); this.dialog.className = 'elsemesh-avatar-dialog' + (app ? ' game' : '');
		this.dialog.setAttribute('aria-label','Choose your avatar');
		this.dialog.innerHTML = `<h2>Your island explorer</h2><img alt="Character style reference"><p>Choose a character and make it yours. Your friends see your character style and colours.</p><label for="elsemesh-avatar-style">Character & hairstyle</label><select id="elsemesh-avatar-style"></select><p>Style reference shown above. Colours apply to your character in the game. Skin tone is independent of gender.</p><div class="elsemesh-avatar-fields"></div><p class="elsemesh-avatar-status" role="status"></p><div class="elsemesh-avatar-actions"><button class="save">Save avatar</button><button class="cancel">Cancel</button></div>`;
		document.body.append(this.dialog);
		const nameLabel=document.createElement('label'); nameLabel.textContent='Character name'; nameLabel.htmlFor='elsemesh-avatar-name';
		this.nameInput=document.createElement('input'); this.nameInput.id=nameLabel.htmlFor; this.nameInput.maxLength=24; this.nameInput.autocomplete='off';
		this.nameInput.style.cssText='box-sizing:border-box;width:100%;padding:10px;border:1px solid #62959a;border-radius:8px;background:#153845;color:white;font:inherit';
		this.dialog.querySelector('.elsemesh-avatar-fields').prepend(nameLabel,this.nameInput);
		const select = this.dialog.querySelector('select');
		for (const [id,style] of Object.entries(AVATAR_STYLES)) select.add(new Option(style.label,id));
		select.onchange = () => { this.draft.style = select.value; this.refresh(); this.preview(); };
		for (const [key,colors] of Object.entries(palettes)) {
			const label = document.createElement('label'); label.textContent = {shirt:'Shirt colour',trousers:'Trouser colour',skin:'Skin tone',hair:'Hair colour'}[key];
			label.htmlFor = `elsemesh-avatar-${key}`;
			const row = document.createElement('div'); row.className = 'elsemesh-avatar-colours'; row.dataset.field = key;
			for (const color of colors) {
				const button = document.createElement('button'); button.style.background = color; button.dataset.color = color;
				button.setAttribute('aria-label',`${label.textContent} ${color}`);
				button.onclick = () => { this.draft[key]=color; this.refresh(); this.preview(); }; row.append(button);
			}
			const input = document.createElement('input'); input.type='color'; input.id=label.htmlFor; input.setAttribute('aria-label',`Custom ${label.textContent.toLowerCase()}`);
			input.oninput = () => { this.draft[key]=input.value; this.refresh(); this.preview(); }; row.append(input);
			this.dialog.querySelector('.elsemesh-avatar-fields').append(label,row);
		}
		this.createFaceEditor();
		this.createVoiceEditor();
		const unsubscribe=attachLocalFacePhotoStore(this);
		const stop=event=>{
			this.voice.stop();
			if(event.persisted)return;
			this.voice.dispose();
			unsubscribe();
			window.removeEventListener('pagehide',stop);
		};
		window.addEventListener('pagehide',stop);
		this.dialog.querySelector('.save').onclick = async () => {
			if(this.faceBusy) { this.status('Wait for your photo to finish loading.'); return; }
			this.saving=true;
			const controls=[...this.dialog.querySelectorAll('button,input,select')].map(control=>[control,control.disabled]);
			for(const [control] of controls) control.disabled=true;
			try {
				await commitAvatarDraft({
					ready:async()=>{ await this.faceTask; if(this.faceError) throw this.faceError; },
					apply:async()=>{ if(app) await app.avatar.setAppearance(this.draft); },
					persist:()=>{ if(this.faceChanged) { if(this.faceDraft) saveFacePhoto(this.faceDraft); else removeFacePhoto(); } },
					restore:async()=>{
						try { if(app) await app.avatar.setAppearance(this.value); }
						finally { this.faceDraft=this.faceOriginal; this.faceSource=null; this.updateFacePreview(); await this.faceTask; }
						if(this.faceError) throw this.faceError;
					},
				});
				this.faceOriginal=this.faceDraft; this.faceChanged=false;
				this.value={...this.draft}; const saved=saveAppearance(this.value);
				this.voiceLine=this.voiceSelect.value; saveAvatarVoiceLine(this.voiceLine);
				this.name=this.nameInput.value.trim().replace(/[\x00-\x1f<>]/g,'').slice(0,24) || 'Explorer';
				try { localStorage.setItem('elsemesh.avatar.name',this.name); } catch { /* Session-only name. */ }
				if(app) app.player.displayName=this.name;
				if(app) app.player.avatarAppearance={...this.value};
				if (!saved) { this.status('Applied for this session. Browser storage is unavailable.'); return; }
				this.close(true);
			} catch(error) { this.status(error.message || 'Could not load this character. Please try again.'); }
			finally { for(const [control,disabled] of controls) control.disabled=disabled; this.saving=false; }
		};
		this.dialog.querySelector('.cancel').onclick = () => this.close(false);
		this.dialog.addEventListener('cancel',event => { event.preventDefault(); this.close(false); });
	}
	createVoiceEditor() {
		this.voiceLine=loadAvatarVoiceLine();
		const section=document.createElement('section'); section.setAttribute('aria-label','Avatar voice');
		section.innerHTML=`<h3>Loz voice</h3><p>Choose a prepared line to speak here. Save avatar keeps your choice. Press J while exploring to speak it again. Sound plays in this browser.</p><label for="elsemesh-avatar-voice">Spoken line</label><select id="elsemesh-avatar-voice"></select><div class="elsemesh-avatar-actions"><button type="button" class="voice-speak">Speak</button><button type="button" class="voice-stop" disabled>Stop</button></div><p class="voice-status" role="status" aria-live="polite"></p>`;
		this.voiceSelect=section.querySelector('select');
		for(const line of AVATAR_VOICE_LINES)this.voiceSelect.add(new Option(line.label,line.id));
		this.voiceSelect.value=this.voiceLine;
		this.voice=new AvatarVoice({onState:({playing,message})=>{
			section.querySelector('.voice-stop').disabled=!playing;
			section.querySelector('.voice-status').textContent=message;
		}});
		section.querySelector('.voice-speak').onclick=()=>{void this.voice.speak(this.voiceSelect.value);};
		section.querySelector('.voice-stop').onclick=()=>this.voice.stop();
		this.voiceSelect.onchange=()=>this.voice.stop();
		// Keep voice controls near the top on small screens, before photo editing.
		this.dialog.querySelector('.elsemesh-avatar-fields').before(section);
	}
	speakVoice() {return this.voice.speak(this.voiceLine);}
	createFaceEditor() {
		const section=document.createElement('section'); section.setAttribute('aria-label','Local face photo');
		section.innerHTML=`<h3>Face photo · this browser only</h3><p>Choose a clear front-facing portrait. Centre your face in the square and adjust the eyes and mouth on your character. This flat photo is applied to the front of the head. Face photos stay in this browser and are visible only on your own character.</p><label for="elsemesh-face-file">Local PNG, JPEG or WebP (up to 8 MB)</label><input id="elsemesh-face-file" type="file" accept="image/png,image/jpeg,image/webp"><canvas width="256" height="256" aria-label="Square photo crop preview" role="img" style="display:block;width:180px;height:180px;margin:12px 0;background:#173541"></canvas><p class="face-empty"></p><div class="face-controls"></div><button type="button" class="face-remove">Remove face photo</button>`;
		this.faceSection=section; this.faceCanvas=section.querySelector('canvas'); this.faceOptions={x:0,y:0,zoom:1,rotation:0};
		for(const [key,label,min,max,step] of [['x','Move photo horizontally',-1,1,.01],['y','Move photo vertically',-1,1,.01],['zoom','Photo zoom',1,4,.01],['rotation','Photo rotation (degrees)',-180,180,1]]) {
			const labelEl=document.createElement('label'); labelEl.textContent=label; labelEl.htmlFor=`elsemesh-face-${key}`;
			const input=document.createElement('input'); input.id=labelEl.htmlFor; input.type='range'; input.min=min; input.max=max; input.step=step; input.value=this.faceOptions[key]; input.dataset.faceControl=key;
			input.oninput=()=>{ if(!this.faceSource) return; this.faceOptions[key]=Number(input.value); this.faceDraft=encodeFacePhoto(this.faceSource,this.faceOptions); this.faceChanged=true; this.updateFacePreview(); };
			section.querySelector('.face-controls').append(labelEl,input);
		}
		section.querySelector('input[type=file]').onchange=async event=>{
			const file=event.target.files?.[0]; if(!file) return;
			const revision=++this.faceRevision; this.faceBusy=true; this.status('Loading local photo…');
			try {
				const source=await decodeFacePhoto(file); if(revision!==this.faceRevision || !this.dialog.open) return;
				this.faceSource=source; this.faceOptions={x:0,y:0,zoom:1,rotation:0};
				for(const input of section.querySelectorAll('[data-face-control]')) input.value=this.faceOptions[input.dataset.faceControl];
				this.faceDraft=encodeFacePhoto(source,this.faceOptions); this.faceChanged=true; this.status('Adjust the crop, then Save avatar to keep this photo in this browser.'); this.faceBusy=false; this.updateFacePreview();
			} catch(error) { if(revision===this.faceRevision) this.status(error.message || 'Could not load this photo.'); }
			finally { if(revision===this.faceRevision) this.faceBusy=false; event.target.value=''; }
		};
		section.querySelector('.face-remove').onclick=()=>{ this.faceRevision++; this.faceBusy=false; this.faceDraft=null; this.faceSource=null; this.faceChanged=true; this.updateFacePreview(); this.status('Photo removed from preview. Save avatar to keep this change.'); };
		this.dialog.querySelector('.elsemesh-avatar-status').before(section);
	}
	updateFacePreview() {
		this.faceError=null;
		const record=this.faceDraft;
		this.faceSection.querySelector('.face-empty').textContent=record?'Square photo crop preview. The game view shows the actual character when the front camera is available.':'No local face photo.';
		for(const input of this.faceSection.querySelectorAll('[data-face-control]')) input.disabled=!this.faceSource;
		this.faceSection.querySelector('.face-remove').disabled=!record;
		const revision=++this.faceRevision;
		const ctx=this.faceCanvas.getContext('2d'); ctx.clearRect(0,0,256,256);
		this.faceTask=(async()=>{
			if(!record) {
				try { await this.app?.avatar.setLocalFacePhoto?.(null); }
				catch(error) { if(revision===this.faceRevision) { this.faceError=error; this.status('Could not update your character preview.'); } }
				return;
			}
			let image;
			try {
				image=await loadFacePhotoImage(record); if(revision!==this.faceRevision) return;
				ctx.drawImage(image,0,0,256,256);
				if(!this.faceSource && this.dialog.open) {
					this.faceSource=document.createElement('canvas'); this.faceSource.width=this.faceSource.height=256;
					this.faceSource.getContext('2d').drawImage(image,0,0);
					for(const input of this.faceSection.querySelectorAll('[data-face-control]')) input.disabled=false;
				}
				await this.app?.avatar.setLocalFacePhoto?.({image,revision:String(revision)});
			} catch(error) { if(revision===this.faceRevision) { this.faceError=error; this.status('Could not display this face photo. Choose another image.'); } }
			finally { image?.close?.(); }
		})();
	}
	status(text) { this.dialog.querySelector('.elsemesh-avatar-status').textContent=text; }
	refresh() {
		this.dialog.querySelector('select').value=this.draft.style;
		this.dialog.querySelector('img').src=`${import.meta.env?.BASE_URL || '/'}models/characters/${AVATAR_STYLES[this.draft.style].image}`;
		for (const row of this.dialog.querySelectorAll('[data-field]')) {
			row.querySelector('input').value=this.draft[row.dataset.field];
			for(const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.color===this.draft[row.dataset.field]));
		}
	}
	preview() { this.app?.avatar.setAppearance(this.draft)?.catch(() => this.status('Character unavailable. Please try again.')); }
	show() {
		if(this.dialog.open || (this.app && (!this.app.input.enabled || !this.app.fly || !this.app.thirdIsland))) return;
		this.draft={...this.value}; this.refresh(); this.status('');
		this.voice.stop(); this.voiceSelect.value=this.voiceLine;
		this.nameInput.value=this.name;
		this.faceOriginal=loadFacePhoto(); this.faceDraft=this.faceOriginal; this.faceSource=null; this.faceChanged=false; this.faceBusy=false;
		this.faceOptions={x:0,y:0,zoom:1,rotation:0};
		for(const input of this.faceSection.querySelectorAll('[data-face-control]')) input.value=this.faceOptions[input.dataset.faceControl];
		this.updateFacePreview();
		if(this.app) {
			const a=this.app; this.previous={freeCam:a.freeCam,position:a.camera.position.clone(),yaw:a.fly.yaw,pitch:a.fly.pitch};
			a.input.suspend(); document.exitPointerLock?.();
			// An external camera previews the actual local avatar; never relocate the player.
			if(a.player.mode==='walk' && !a.thirdIsland.active && a.monorail.state!=='riding') {
				a.setFreeCam(true); const p=a.player.position;
				a.fly.velocity.set(0,0,0);
				a.fly.setPose(a.camera.position.set(p.x-Math.sin(a.player.yaw)*3.4,p.y+1.05,p.z-Math.cos(a.player.yaw)*3.4),a.player.yaw+Math.PI,-.02);
			}
		}
		this.dialog.showModal();
	}
	close(accepted) {
		if(this.saving && !accepted) { this.status('Finishing your save. Please wait.'); return; }
		this.voice.stop();
		this.faceRevision++; this.faceBusy=false; this.faceSource=null;
		if(!accepted) { this.app?.avatar.setAppearance(this.value)?.catch(()=>{}); this.faceDraft=this.faceOriginal; this.updateFacePreview(); }
		this.dialog.close();
		if(this.app) {
			const a=this.app,p=this.previous; a.setFreeCam(p.freeCam);
			if(p.freeCam) a.fly.setPose(p.position,p.yaw,p.pitch);
			a.input.resume(); a.input.requestLock();
		}
		this.button.focus();
	}
}
