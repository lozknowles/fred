import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AVATAR_VOICE_PUBLICATION_PINS as pins,verifyAvatarVoiceDelivery,validateAvatarVoiceMedia} from '../tools/avatar-voice-publication.mjs';

const current=()=>Object.fromEntries(Object.entries(pins).map(([name,pin])=>['assets/'+name,pin.sha256]));
const metadata=()=>({schema:'fred.avatar-voice-media/1',current:current(),compatibility:{}});
test('exact five synthetic final deliveries match immutable name, length and SHA pins',async()=>{
 assert.equal(Object.keys(pins).length,5);
 for(const [name,pin]of Object.entries(pins)){
  const source=name.replace(/-[A-Za-z0-9_-]{8}\.mp3$/,'.mp3');const bytes=await fs.readFile(new URL('../src/player/voice/'+source,import.meta.url));
  assert.equal(verifyAvatarVoiceDelivery(name,bytes),pin.sha256);
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
  assert.throws(()=>verifyAvatarVoiceDelivery(name,changed),/Unadmitted/);
  assert.throws(()=>verifyAvatarVoiceDelivery(name,bytes.subarray(1)),/Unadmitted/);
  for(const bad of [source,'reference-'+name,'../'+name,'assets/'+name,'sample.wav'])assert.throws(()=>verifyAvatarVoiceDelivery(bad,bytes),/Unadmitted/);
 }
});
test('separate delivery metadata requires exactly all five active clips and bounded known compatibility',()=>{
 validateAvatarVoiceMedia(metadata());validateAvatarVoiceMedia(undefined,{required:false});
 const compat=metadata();compat.compatibility={...compat.current};validateAvatarVoiceMedia(compat);
 for(const mutate of [m=>delete m.current[Object.keys(m.current)[0]],m=>m.current['assets/raw-reference.mp3']='a'.repeat(64),m=>m.current[Object.keys(m.current)[0]]='a'.repeat(64),m=>m.compatibility['assets/sample.wav']='a'.repeat(64),m=>m.schema='other',m=>m.profile='private',m=>m.current=[]]){
  const candidate=metadata();mutate(candidate);assert.throws(()=>validateAvatarVoiceMedia(candidate));
 }
 assert.throws(()=>validateAvatarVoiceMedia(undefined));
});
