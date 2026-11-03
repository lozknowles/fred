import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseGLB} from '../src/engine/loaders/GLTF.js';
import {bakeFacePhoto,faceProjection,createLocalFacePhotoController} from '../src/player/AvatarFacePhoto.js';
import {bindNativeFaceTexture,bindWebGLFaceTexture} from '../src/player/AvatarFacePhotoMaterials.js';
const marker={width:16,height:16,data:Uint8Array.from({length:16*16*4},(_,i)=>i%4===3?255:i%4===0?Math.floor(i/4)%16*17:i%4===1?Math.floor(i/64)*17:25)};
const source=async asset=>parseGLB(await readFile(new URL('../public/models/characters/'+asset+'.glb',import.meta.url)));
test('real installed male/female atlases bake asymmetric colour on bounded frontal head UVs',async()=>{
 for(const asset of ['stock-player','stock-female']){
  const g=await source(asset),atlas=bakeFacePhoto(g,asset,marker,256),pixels=[];
  for(let i=0;i<atlas.data.length;i+=4)if(atlas.data[i+3])pixels.push(i);
  assert.ok(pixels.length>500);assert.ok(pixels.length<256*256*.4);assert.ok(pixels.some(i=>atlas.data[i+3]>245));assert.ok(pixels.some(i=>atlas.data[i+3]>0&&atlas.data[i+3]<100));
  assert.ok(new Set(pixels.map(i=>atlas.data[i])).size>8);assert.ok(new Set(pixels.map(i=>atlas.data[i+1])).size>8);
  assert.deepEqual(bakeFacePhoto(g,asset,marker,256).data,atlas.data);
 }
});
test('front projection excludes back, neck, side, non-head influence, and preserves left/top orientation',()=>{
 for(const [asset,y,z]of [['stock-player',1.657,.14],['stock-female',1.582,.07]]){
  assert.ok(faceProjection(asset,0,y,z,1).alpha>.99);
  for(const f of [faceProjection(asset,0,y,-.1,1),faceProjection(asset,.15,y,z,1),faceProjection(asset,0,1.2,z,1),faceProjection(asset,0,y,z,-1),faceProjection(asset,0,y,z,1,0)])assert.equal(f.alpha,0);
  assert.ok(faceProjection(asset,-.02,y+.02,z,1).u<.5);assert.ok(faceProjection(asset,-.02,y+.02,z,1).v<.5);
 }
});
test('face intent survives model replacement, stale loads never allocate, removal/disposal release exactly once',async()=>{
 const g=await source('stock-player'),requests=[],created=[],bound=[];let target={model:{},asset:'stock-player'};
 const c=createLocalFacePhotoController({getTarget:()=>target,loadSource:()=>new Promise(resolve=>requests.push(()=>resolve(g))),createTexture:()=>{const t={disposed:0,dispose(){this.disposed++;}};created.push(t);return t;},bindTexture:(target,texture)=>bound.push({target,texture})});
 const first=c.set({image:marker}),second=c.set({image:marker});requests.shift()();assert.equal(await first,false);assert.equal(created.length,0);requests.shift()();assert.equal(await second,true);
 c.detach();assert.equal(created[0].disposed,1);target={model:{},asset:'stock-player'};const refresh=c.refresh();requests.shift()();assert.equal(await refresh,true);await c.set(null);assert.equal(created[1].disposed,1);
 const pending=c.set({image:marker});c.dispose();requests.shift()();assert.equal(await pending,false);assert.equal(created.length,2);assert.equal(await c.set({image:marker}),false);
});
test('shader adapters touch head only, preserve prior shading/transport, and photo does not enter appearance uniforms',()=>{
 const native={name:'skinned-head',surface:'original();',bindings:{},userData:{}},body={name:'skinned-body',surface:'body();'};
 bindNativeFaceTexture({model:{materials:[native,body]}},{});assert.match(native.surface,/mix\(s.albedo/);assert.match(native.surface,/orm.r\*5.0/);assert.equal(body.surface,'body();');bindNativeFaceTexture({model:{materials:[native,body]}},null);assert.equal(native.surface,'original();');assert.deepEqual(native.bindings,{});
 const head={name:'head',userData:{avatarUniforms:{shirt:{value:1}}},onBeforeCompile(shader){shader.fragmentShader+='\noriginalTransport();';},customProgramCacheKey:()=> 'base'},other={name:'body',userData:{}};
 const model={traverse(fn){fn({material:[head,other]});}},photo={private:true};bindWebGLFaceTexture({model},photo);
 const shader={uniforms:{},fragmentShader:'#include <color_fragment>'};head.onBeforeCompile(shader);assert.match(shader.fragmentShader,/originalTransport/);assert.match(shader.fragmentShader,/localFace.rgb/);assert.equal(shader.uniforms.localFacePhoto.value,photo);assert.deepEqual(Object.keys(head.userData.avatarUniforms),['shirt']);assert.equal(other.onBeforeCompile,undefined);
 bindWebGLFaceTexture({model},null);const clear={uniforms:{},fragmentShader:''};head.onBeforeCompile(clear);assert.equal(clear.uniforms.localFacePhoto.value,null);assert.equal(clear.uniforms.localFaceEnabled.value,0);assert.equal(head.customProgramCacheKey(),'base|local-face-photo-v2');
});
test('one compiled WebGL shader observes A to B to remove to B through stable sampler/enable uniforms',()=>{
 const albedo={original:true},A={disposed:false},B={disposed:false};let compiled=0;
 const head={name:'head',map:albedo,userData:{},onBeforeCompile(){compiled++;},customProgramCacheKey:()=> 'base'};
 const model={traverse(fn){fn({material:head});}};
 bindWebGLFaceTexture({model},A);
 const shader={uniforms:{},fragmentShader:'#include <color_fragment>'};head.onBeforeCompile(shader);
 const sampler=shader.uniforms.localFacePhoto,enabled=shader.uniforms.localFaceEnabled,key=head.customProgramCacheKey();
 assert.equal(sampler.value,A);assert.equal(enabled.value,1);head.needsUpdate=false;
 bindWebGLFaceTexture({model},B);A.disposed=true;
 assert.equal(sampler.value,B);assert.equal(sampler.value.disposed,false);assert.equal(enabled.value,1);
 bindWebGLFaceTexture({model},null);assert.equal(sampler.value,albedo);assert.equal(enabled.value,0);
 bindWebGLFaceTexture({model},B);assert.equal(sampler.value,B);assert.equal(enabled.value,1);
 assert.equal(shader.uniforms.localFacePhoto,sampler);assert.equal(shader.uniforms.localFaceEnabled,enabled);assert.equal(compiled,1);assert.equal(head.customProgramCacheKey(),key);assert.equal(head.needsUpdate,false);
 assert.match(shader.fragmentShader,/if\(localFaceEnabled>0.5\)/);
});
test('caller pixels may be released or mutated immediately; later model refresh retains private copy',async()=>{
 const g=await source('stock-player'),input={...marker,data:marker.data.slice()},atlases=[];let resolve;
 const c=createLocalFacePhotoController({getTarget:()=>({model:g,asset:'stock-player'}),loadSource:()=>new Promise(r=>{resolve=r;}),createTexture:atlas=>{atlases.push(atlas.data);return {dispose(){}};},bindTexture(){}});
 const first=c.set({image:input});input.data.fill(0);resolve(g);assert.equal(await first,true);assert.ok(atlases[0].some(v=>v>0));
 const second=c.refresh();resolve(g);assert.equal(await second,true);assert.deepEqual(atlases[1],atlases[0]);c.dispose();
});
