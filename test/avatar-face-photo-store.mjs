import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFacePhotoBytes, validateFacePhoto, loadFacePhoto, saveFacePhoto, removeFacePhoto, FACE_PHOTO_KEY, decodeFacePhoto } from '../src/player/AvatarFacePhotoStore.js';
function png(width=256,height=256) { const b=new Uint8Array(32); b.set([137,80,78,71,13,10,26,10]); b.set([73,72,68,82],12); const v=new DataView(b.buffer); v.setUint32(16,width); v.setUint32(20,height); return b; }
function record(bytes=png()) { return {version:1,dataUrl:'data:image/png;base64,'+Buffer.from(bytes).toString('base64')}; }
test('inspects actual raster bytes and bounds dimensions before decode', async()=>{
 assert.deepEqual(inspectFacePhotoBytes(png()),{width:256,height:256,type:'image/png'});
 for(const input of [new TextEncoder().encode('<svg width="256" height="256"></svg>'),png(10000,2),png(8192,8192),new Uint8Array(8*1024*1024+1)]) assert.throws(()=>inspectFacePhotoBytes(input));
 let decoded=false; globalThis.createImageBitmap=()=>{decoded=true; throw Error('should not decode');};
 await assert.rejects(decodeFacePhoto(new Blob([png(9000,1)],{type:'image/png'}))); assert.equal(decoded,false); delete globalThis.createImageBitmap;
});
test('reads JPEG frame dimensions and rejects malformed lengths',()=>{
 const jpeg=Uint8Array.from([255,216,255,192,0,17,8,1,0,1,0,3,1,17,0,2,17,0,3,17,0,255,217,0]);
 assert.deepEqual(inspectFacePhotoBytes(jpeg),{width:256,height:256,type:'image/jpeg'});
 jpeg[4]=255; assert.throws(()=>inspectFacePhotoBytes(jpeg));
});
test('reads WebP extended dimensions',()=>{
 const b=new Uint8Array(30); const put=(i,s)=>b.set(new TextEncoder().encode(s),i); put(0,'RIFF'); put(8,'WEBP'); put(12,'VP8X'); b[24]=255; b[27]=255;
 assert.deepEqual(inspectFacePhotoBytes(b),{width:256,height:256,type:'image/webp'});
});
test('local persistence accepts only normalized bounded PNG, never original/path/extra peer fields',()=>{
 const values=new Map(); const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 assert.equal(loadFacePhoto(storage),null); saveFacePhoto(record(),storage);
 assert.deepEqual(loadFacePhoto(storage),record()); assert.deepEqual([...values.keys()],[FACE_PHOTO_KEY]);
 assert.throws(()=>saveFacePhoto({...record(),path:'private-source.png'},storage));
 assert.throws(()=>validateFacePhoto(record(png(512,512)))); assert.throws(()=>validateFacePhoto({version:1,dataUrl:'https://example.test/photo.png'}));
 removeFacePhoto(storage); assert.equal(loadFacePhoto(storage),null);
 assert.throws(()=>saveFacePhoto(record(),{setItem(){throw Error('quota');}}),/quota/);
 assert.throws(()=>removeFacePhoto({removeItem(){throw Error('quota');}}),/quota/);
 assert.equal(loadFacePhoto({getItem(){throw Error('denied');}}),null);
});
