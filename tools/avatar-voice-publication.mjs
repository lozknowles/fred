import {createHash} from 'node:crypto';

// Only these five final synthetic delivery clips are publishable. No reference,
// conditioning representation, unbounded media directory, or arbitrary MP3.
export const AVATAR_VOICE_PUBLICATION_PINS=Object.freeze({
 'avatar-welcome-DVUHp6Ab.mp3':{bytes:23277,sha256:'4f0b05c56e222124c727d6573f520ca571691ab541f121d72869a1c6a648487b'},
 'tour-c64-DUs2amWt.mp3':{bytes:51261,sha256:'88442663dd138289491abd33c55fd5fabf3ec0f8b57c5fc7c3e41d37409e3532'},
 'tour-dock-Caly83Fm.mp3':{bytes:43389,sha256:'0ae2ceb208293471a3333e0692eea22ef6e2da4e9d054cd76c5153c0f4c65930'},
 'tour-portals-nL7pCfNb.mp3':{bytes:51837,sha256:'dd02db67e16ce21a751049bc6e1aae413360cda473e5ae4b9031edd0b9a5e905'},
 'tour-warehouse-BAiK8XcG.mp3':{bytes:47469,sha256:'ae9c31857dd7aa87eac08a1ac6f7d38011596633d28421009ecabd18c887fbc5'},
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyAvatarVoiceDelivery(name,bytes) {
 const pin=Object.hasOwn(AVATAR_VOICE_PUBLICATION_PINS,name)&&AVATAR_VOICE_PUBLICATION_PINS[name];
 if(!pin||bytes.byteLength!==pin.bytes||sha(bytes)!==pin.sha256)throw Error('Unadmitted avatar voice delivery: '+name);
 return pin.sha256;
}
export function validateAvatarVoiceMedia(media,{required=true}={}) {
 if(!media&&!required)return;
 if(!media||media.schema!=='fred.avatar-voice-media/1'||Object.keys(media).sort().join(',')!=='compatibility,current,schema')throw Error('Invalid avatar voice media metadata');
 for(const [kind,entries] of [['current',media.current],['compatibility',media.compatibility]]) {
  if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>5)throw Error('Invalid avatar voice media inventory');
  if(kind==='current'&&Object.keys(entries).length!==5)throw Error('Incomplete avatar voice media inventory');
  for(const [relative,digest] of Object.entries(entries)) {
   const name=relative.startsWith('assets/')?relative.slice(7):'';
   if(!Object.hasOwn(AVATAR_VOICE_PUBLICATION_PINS,name)||digest!==AVATAR_VOICE_PUBLICATION_PINS[name].sha256)throw Error('Unadmitted avatar voice media metadata');
  }
 }
}
