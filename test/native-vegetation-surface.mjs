import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {loadNativeLeafAtlas,nativeLeafAtlasURL,nativeLeafAtlasMetadata} from '../src/world-runtime/NativeVegetation.js';
const sha=value=>createHash('sha256').update(value).digest('hex');

test('offline authored canopy atlas retains four distinct, supersampled coverage tiles and numeric channels',async()=>{
 const png=await readFile(nativeLeafAtlasURL),meta=nativeLeafAtlasMetadata;
 assert.equal(sha(png),meta.pngSHA256);
 assert.equal(sha(await readFile(new URL('../src/world/vegetation/LeafTextures.js',import.meta.url))),meta.sourceSHA256);
 assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);
 const chunks=[];for(let offset=8;offset<png.length;){const n=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+n));offset+=n+12;}
 const scan=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(1024*1024*4);
 for(let y=0;y<1024;y++){assert.equal(scan[y*4097],0);scan.copy(pixels,y*4096,y*4097+1,(y+1)*4097);}
 assert.equal(sha(pixels),meta.pixelSHA256);
 const sums=[];for(let tile=0;tile<4;tile++){
  let coverage=0,partial=0;const random=new Set(),brightness=new Set();
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
   const i=((Math.floor(tile/2)*512+y)*1024+(tile%2)*512+x)*4,c=pixels[i];
   assert.equal(pixels[i+3],255);coverage+=c/255;
   if(c>0&&c<255)partial++;if(c===255){brightness.add(pixels[i+1]);random.add(pixels[i+2]);}
  }
  coverage/=512**2;assert.ok(coverage>.2&&coverage<.35,'sky holes remain between clusters');assert.ok(partial>4000,'four-sample edge coverage retained');assert.ok(brightness.size>40&&random.size>100,'unpremultiplied brightness and per-leaf tint retained');sums.push(coverage);
 }
 assert.ok(sums[0]>sums[1]&&sums[2]>sums[3],'broad and narrow species retain different coverage');
});

test('production atlas loader preserves data channels, source filter policy and bitmap ownership',async()=>{
 const originalFetch=globalThis.fetch,originalDecode=globalThis.createImageBitmap;let closed=0,seenOptions;
 globalThis.fetch=async url=>{assert.equal(url,nativeLeafAtlasURL);return new Response(await readFile(nativeLeafAtlasURL));};
 globalThis.createImageBitmap=async(blob,options)=>{seenOptions=options;assert.ok(blob.size>300000);return{width:1024,height:1024,close(){closed++;}};};
 try{
  const texture=await loadNativeLeafAtlas();
  assert.deepEqual(seenOptions,{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'});
  assert.equal(texture.colorSpace,T.NoColorSpace);assert.equal(texture.flipY,false);assert.equal(texture.wrapS,T.RepeatWrapping);assert.equal(texture.wrapT,T.RepeatWrapping);
  assert.equal(texture.minFilter,T.LinearMipmapLinearFilter);assert.equal(texture.magFilter,T.LinearFilter);assert.equal(texture.generateMipmaps,true);assert.equal(texture.anisotropy,8);
  assert.equal(closed,0);texture.dispose();assert.equal(closed,1);
  globalThis.createImageBitmap=async()=>({width:512,height:1024,close(){closed++;}});
  await assert.rejects(loadNativeLeafAtlas(),/dimensions differ/);assert.equal(closed,2);
 }finally{globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalDecode;}
});
