import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createWorld,packWorldRepository,loadWorldSource,repositoryDigest,describeRuntimeWorld,T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {hostedRepositorySource} from '../src/world-runtime/HostedRepository.js';
import {collectVerifiedRepositoryTextureTiers,textureTierReferences,assertTextureTierCompatible,readVerifiedTextureTier,createRepositoryTextureTiers} from '../src/world-runtime/RepositoryTextureTiers.js';
import {buildWebGLRepositoryScene,disposeWebGLRepositoryScene} from '../src/world-runtime/WebGLRepositoryScene.js';
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
function png(size){
 const chunk=(name,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);b.set(data,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;};
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 const pixels=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size*4;x++)pixels[y*(size*4+1)+1+x]=(x*73+y*41+x*y*23)%256;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function glb(size){
 const image=png(size),geometry=Buffer.alloc(60);new Float32Array(geometry.buffer,geometry.byteOffset,9).set([-1,0,0,1,0,0,0,2,0]);new Float32Array(geometry.buffer,geometry.byteOffset+36,6).set([0,0,1,0,.5,1]);
 const json={asset:{version:'2.0'},buffers:[{byteLength:60+image.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24},{buffer:0,byteOffset:60,byteLength:image.length}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]},{bufferView:1,componentType:5126,count:3,type:'VEC2'}],images:[{bufferView:2,mimeType:'image/png'}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 let text=JSON.stringify(json);while(text.length%4)text+=' ';const bin=Buffer.concat([geometry,image,Buffer.alloc((4-(60+image.length)%4)%4)]),bytes=Buffer.alloc(28+text.length+bin.length);bytes.writeUInt32LE(0x46546c67);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(text.length,12);bytes.writeUInt32LE(0x4e4f534a,16);bytes.write(text,20);bytes.writeUInt32LE(bin.length,20+text.length);bytes.writeUInt32LE(0x004e4942,24+text.length);bytes.set(bin,28+text.length);return bytes;
}
async function fixture(){
 const bytes=glb(2),fine=glb(8),sha256=await repositoryDigest(fine),ref={path:'assets/'+sha256+'.glb',sha256,bytes:fine.length,distance:15};
 const asset={id:'owned-art',name:'Owned artwork',mediaType:'model/gltf-binary',bytes:bytes.length,dataUrl:'data:application/octet-stream;base64,'+bytes.toString('base64'),source:'Authored test pixels',license:'MIT',textureTiers:[ref]};
 const project=createWorld('Texture fixture');project.assets=[asset];project.objects=[{id:'art',kind:'glb',name:'art',assetId:asset.id,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'none'}];
 const files=await packWorldRepository(project);files.set(ref.path,fine);return {bytes,fine,ref,asset,project,files};
}
test('hashed repository metadata survives packaging, normal hosted admission and runtime cloning without eager fine reads',async()=>{
 const f=await fixture(),seen=[],source=hostedRepositorySource('/worlds/private/',{origin:'https://example.test',baseURL:'https://example.test/worlds.html',fetch:async url=>{const path=new URL(url).pathname.slice('/worlds/private/'.length);seen.push(path);return new Response(f.files.get(path)??null,{status:f.files.has(path)?200:404});}});
 const loaded=await loadWorldSource(source);assert.deepEqual(loaded.project.assets[0].textureTiers,[f.ref]);assert.deepEqual(describeRuntimeWorld(loaded.project).project.assets[0].textureTiers,[f.ref]);assert.ok(!seen.includes(f.ref.path));
 const verified=await readVerifiedTextureTier(source.textureTierRead,f.ref,f.bytes);assert.deepEqual([...verified],[...f.fine]);assert.equal(seen.filter(p=>p===f.ref.path).length,1);
});
test('packager collection includes only authenticated complete tier bytes and rejects missing or incompatible content',async()=>{
 const f=await fixture(),seen=[];const files=await collectVerifiedRepositoryTextureTiers(f.project,async p=>{seen.push(p);return f.files.get(p);});assert.deepEqual(seen,[f.ref.path]);assert.deepEqual([...files.get(f.ref.path)],[...f.fine]);
 await assert.rejects(collectVerifiedRepositoryTextureTiers(f.project,async()=>f.bytes),/hash or size/);
});
test('full SHA, byte count, geometry/material equivalence and reference restrictions fail closed',async()=>{
 const f=await fixture();assertTextureTierCompatible(f.bytes,f.fine);
 const tampered=Buffer.from(f.fine);tampered[tampered.length-5]^=1;await assert.rejects(readVerifiedTextureTier(async()=>tampered,f.ref,f.bytes),/hash/);
 await assert.rejects(readVerifiedTextureTier(async()=>f.fine.subarray(1),f.ref,f.bytes),/size/);
 const changed=Buffer.from(f.fine),jsonLength=changed.readUInt32LE(12);changed[28+jsonLength]^=1;assert.throws(()=>assertTextureTierCompatible(f.bytes,changed),/geometry|bounds|positions/i);
 assert.throws(()=>textureTierReferences({...f.asset,textureTiers:[{...f.ref,path:'../other.glb'}]}));
 assert.deepEqual(textureTierReferences({...f.asset,textureTiers:undefined}),[]);
});
test('distance scheduling shares one verified request, preserves texture settings, and never retries rejected bytes',async()=>{
 const f=await fixture(),texture={isTexture:true,image:{width:2},colorSpace:'srgb',wrapS:123},material={map:texture},loaded={scene:{},materialIndices:new Map([[material,0]])};let reads=0,parses=0;
 const controller=createRepositoryTextureTiers({read:async()=>{reads++;return f.fine;},parse:async()=>{parses++;return {scene:{},materialIndices:new Map([[{map:{isTexture:true,image:{width:8}}},0]])};}});
 controller.register(f.asset,f.bytes,loaded,[[0,0,0]]);controller.register(f.asset,f.bytes,loaded,[[5,0,0]]);controller.update({position:{x:100,y:0,z:0}});assert.equal(reads,0);
 for(let i=0;i<5;i++)controller.update({position:{x:0,y:0,z:0}});await controller.whenIdle();assert.equal(reads,1);assert.equal(parses,1);assert.equal(texture.image.width,8);assert.equal(texture.wrapS,123);assert.equal(texture.colorSpace,'srgb');assert.equal(controller.stats.promotions,1);assert.equal(controller.stats.retainedSourceBytes,0);controller.dispose();
 const bad=createRepositoryTextureTiers({read:async()=>f.bytes,parse:async()=>{throw Error('must not parse');}});bad.register(f.asset,f.bytes,loaded,[[0,0,0]]);bad.update({position:{x:0,y:0,z:0}});await bad.whenIdle();bad.update({position:{x:0,y:0,z:0}});assert.equal(bad.stats.requests,1);assert.equal(bad.stats.failures,1);assert.equal(bad.stats.retainedSourceBytes,0);bad.dispose();
});
test('successive tiers fetch in coarse-to-fine order at decreasing distances with no repeated approach download',async()=>{
 const f=await fixture(),finest=glb(16),sha256=await repositoryDigest(finest),ref2={path:'assets/'+sha256+'.glb',sha256,bytes:finest.length,distance:4},seen=[];
 const current={scene:{},materialIndices:new Map()},asset={...f.asset,textureTiers:[f.ref,ref2]},controller=createRepositoryTextureTiers({read:async p=>{seen.push(p);return p===f.ref.path?f.fine:finest;},parse:async()=>({scene:{},materialIndices:new Map()})});
 controller.register(asset,f.bytes,current,[[0,0,0]]);controller.update({position:{x:8,y:0,z:0}});await controller.whenIdle();assert.deepEqual(seen,[f.ref.path]);assert.equal(controller.stats.retainedSourceBytes,f.bytes.length);controller.update({position:{x:8,y:0,z:0}});await controller.whenIdle();assert.equal(seen.length,1);controller.update({position:{x:2,y:0,z:0}});await controller.whenIdle();assert.deepEqual(seen,[f.ref.path,ref2.path]);assert.equal(controller.stats.retainedSourceBytes,0);controller.update({position:{x:2,y:0,z:0}});assert.equal(seen.length,2);controller.dispose();
});
test('disposed in-flight jobs cannot parse, promote or retain scenes',async()=>{
 const f=await fixture();let release,parsed=0;const c=createRepositoryTextureTiers({read:()=>new Promise(r=>release=r),parse:()=>{parsed++;}});c.register(f.asset,f.bytes,{materialIndices:new Map()},[[0,0,0]]);c.update({position:{x:0,y:0,z:0}});c.dispose();assert.equal(c.stats.retainedSourceBytes,0);release(f.fine);await c.whenIdle();assert.equal(parsed,0);assert.equal(c.stats.promotions,0);
});
// CPU-only ImageBitmap stand-in lets the actual GLTFLoader and scene ownership
// path run in Node. This verifies integration, not GPU upload or visual quality.
test('normal WebGL candidate actually fetches fine only on a near view and owns its disposal',async()=>{
 const f=await fixture(),seen=[];globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
 const source=hostedRepositorySource('/worlds/private/',{origin:'https://example.test',baseURL:'https://example.test/',fetch:async url=>{const p=new URL(url).pathname.slice('/worlds/private/'.length);seen.push(p);return new Response(f.files.get(p));}}),loaded=await loadWorldSource(source),camera=new T.PerspectiveCamera();camera.position.set(100,0,0);
 const candidate=await buildWebGLRepositoryScene(describeRuntimeWorld(loaded.project),camera,{loaded});try{assert.equal(candidate.textureTiers.stats.eligible,1);assert.equal(candidate.textureTiers.stats.retainedSourceBytes,f.bytes.length);assert.ok([...candidate.loadedAssets].every(a=>!('textureTierBytes' in a)));candidate.root.userData.updateWebGL(0,camera);assert.ok(!seen.includes(f.ref.path));camera.position.set(0,0,0);candidate.root.userData.updateWebGL(1,camera);await candidate.textureTiers.whenIdle();assert.equal(candidate.textureTiers.stats.promotions,1);assert.equal(seen.filter(p=>p===f.ref.path).length,1);assert.equal(candidate.loadedAssets.size,2);assert.equal(candidate.textureTiers.stats.retainedSourceBytes,0);}finally{disposeWebGLRepositoryScene(candidate);delete globalThis.createImageBitmap;delete globalThis.self;}
});

test('legacy hosted assets retain no extra tier source buffer',async()=>{
 const f=await fixture();delete f.project.assets[0].textureTiers;const files=await packWorldRepository(f.project);
 globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
 const source=hostedRepositorySource('/worlds/legacy/',{origin:'https://example.test',baseURL:'https://example.test/',fetch:async url=>new Response(files.get(new URL(url).pathname.slice('/worlds/legacy/'.length)))}),loaded=await loadWorldSource(source);
 const candidate=await buildWebGLRepositoryScene(describeRuntimeWorld(loaded.project),new T.PerspectiveCamera(),{loaded});
 try{assert.equal(candidate.textureTiers.stats.eligible,0);assert.equal(candidate.textureTiers.stats.retainedSourceBytes,0);assert.ok([...candidate.loadedAssets].every(asset=>!('textureTierBytes' in asset)));candidate.root.userData.updateWebGL(1);await candidate.textureTiers.whenIdle();assert.equal(candidate.textureTiers.stats.requests,0);}finally{disposeWebGLRepositoryScene(candidate);delete globalThis.createImageBitmap;delete globalThis.self;}
});
