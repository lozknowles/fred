// Local face photos deliberately never enter AvatarAppearance or peer messages.
export const FACE_PHOTO_KEY = 'elsemesh.avatar.face.v1';
export const FACE_PHOTO_EVENT = 'elsemesh-local-face-photo';
export const FACE_PHOTO_SIZE = 256;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 8192;
const MAX_PIXELS = 32 * 1024 * 1024;
export function inspectFacePhotoBytes(bytes) {
 if (!(bytes instanceof Uint8Array) || bytes.length < 24 || bytes.length > MAX_BYTES) throw new Error('Choose a PNG, JPEG or WebP photo under 8 MB.');
 const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 const ascii = (at,n) => String.fromCharCode(...bytes.subarray(at,at+n));
 let width, height, type;
 if (ascii(0,8) === '\x89PNG\r\n\x1a\n' && ascii(12,4) === 'IHDR') { width=v.getUint32(16); height=v.getUint32(20); type='image/png'; }
 else if (ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP') {
  type='image/webp'; const kind=ascii(12,4);
  if(kind==='VP8X' && bytes.length>=30) { width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16); height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16); }
  else if(kind==='VP8L' && bytes.length>=25 && bytes[20]===0x2f) { const bits=v.getUint32(21,true); width=(bits&0x3fff)+1; height=((bits>>>14)&0x3fff)+1; }
  else if(kind==='VP8 ' && bytes.length>=30 && bytes[23]===0x9d && bytes[24]===1 && bytes[25]===0x2a) { width=v.getUint16(26,true)&0x3fff; height=v.getUint16(28,true)&0x3fff; }
 } else if(bytes[0]===0xff && bytes[1]===0xd8) {
  type='image/jpeg'; let i=2;
  while(i+3<bytes.length) {
   if(bytes[i++]!==0xff) break;
   while(bytes[i]===0xff) i++;
   const marker=bytes[i++]; if(marker===0xd9 || marker===0xda) break;
   if(marker===1 || (marker>=0xd0 && marker<=0xd7)) continue;
   if(i+2>bytes.length) break; const len=v.getUint16(i);
   if(len<2 || i+len>bytes.length) break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && len>=7) { height=v.getUint16(i+3); width=v.getUint16(i+5); break; }
   i+=len;
  }
 }
 if(!type || !width || !height) throw new Error('This file is not a supported raster photo.');
 if(width>MAX_EDGE || height>MAX_EDGE || width*height>MAX_PIXELS) throw new Error('Photo is too large. Use an image up to 8192 pixels and 32 megapixels.');
 return {width,height,type};
}
export function validateFacePhoto(record) {
 if(!record || Object.keys(record).length!==2 || record.version!==1 || typeof record.dataUrl!=='string' || record.dataUrl.length>400000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(record.dataUrl)) throw new Error('Invalid local face photo.');
 const raw=atob(record.dataUrl.slice(22)); const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const info=inspectFacePhotoBytes(bytes);
 if(info.type!=='image/png' || info.width!==FACE_PHOTO_SIZE || info.height!==FACE_PHOTO_SIZE) throw new Error('Invalid local face photo size.');
 return {version:1,dataUrl:record.dataUrl};
}
export function loadFacePhoto(storage) { try { return validateFacePhoto(JSON.parse((storage || globalThis.localStorage).getItem(FACE_PHOTO_KEY))); } catch { return null; } }
export function saveFacePhoto(record, storage=globalThis.localStorage) {
 const value=validateFacePhoto(record);
 storage.setItem(FACE_PHOTO_KEY,JSON.stringify(value));
 globalThis.dispatchEvent?.(new CustomEvent(FACE_PHOTO_EVENT,{detail:value})); return value;
}
export function removeFacePhoto(storage=globalThis.localStorage) { storage.removeItem(FACE_PHOTO_KEY); globalThis.dispatchEvent?.(new CustomEvent(FACE_PHOTO_EVENT,{detail:null})); }
export function subscribeFacePhoto(listener) { const handle=e=>listener(e.detail); globalThis.addEventListener?.(FACE_PHOTO_EVENT,handle); return ()=>globalThis.removeEventListener?.(FACE_PHOTO_EVENT,handle); }
export async function decodeFacePhoto(blob) {
 if(!blob || blob.size>MAX_BYTES || blob.size<24) throw new Error('Choose a PNG, JPEG or WebP photo under 8 MB.');
 const bytes=new Uint8Array(await blob.arrayBuffer()); const info=inspectFacePhotoBytes(bytes);
 // Decode only validated, bounded raster bytes; EXIF orientation is applied by the browser.
 const safeBlob=new Blob([bytes],{type:info.type});
 let decoded;
 try { decoded=await createImageBitmap(safeBlob,{imageOrientation:'from-image'}); } catch { throw new Error('This photo could not be decoded. Choose another PNG, JPEG or WebP.'); }
 if(!decoded.width || !decoded.height || decoded.width>MAX_EDGE || decoded.height>MAX_EDGE || decoded.width*decoded.height>MAX_PIXELS) { decoded.close(); throw new Error('Decoded photo is too large.'); }
 const scale=Math.min(1,1024/Math.max(decoded.width,decoded.height));
 const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(decoded.width*scale)); canvas.height=Math.max(1,Math.round(decoded.height*scale));
 canvas.getContext('2d').drawImage(decoded,0,0,canvas.width,canvas.height); decoded.close(); return canvas;
}
export function encodeFacePhoto(source,{x=0,y=0,zoom=1,rotation=0}={}) {
 const bounded=(n,min,max,fallback)=>Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
 x=bounded(x,-1,1,0); y=bounded(y,-1,1,0); zoom=bounded(zoom,1,4,1); rotation=bounded(rotation,-180,180,0);
 const canvas=document.createElement('canvas'); canvas.width=canvas.height=FACE_PHOTO_SIZE; const ctx=canvas.getContext('2d');
 ctx.fillStyle='#b38970'; ctx.fillRect(0,0,256,256); ctx.translate(128+x*128,128+y*128); ctx.rotate(rotation*Math.PI/180);
 const scale=256/Math.min(source.width,source.height)*zoom; ctx.scale(scale,scale); ctx.drawImage(source,-source.width/2,-source.height/2);
 return {version:1,dataUrl:canvas.toDataURL('image/png')};
}
export async function normalizeFacePhoto(blob,options) { return encodeFacePhoto(await decodeFacePhoto(blob),options); }
export async function loadFacePhotoImage(record) {
 const value=validateFacePhoto(record); const raw=atob(value.dataUrl.slice(22));
 return createImageBitmap(new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'image/png'}));
}
