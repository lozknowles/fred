import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {compileWebGLRepositoryPass} from '../src/world-runtime/WebGLRepositoryPrograms.js';

function fixture(){
 const calls=[],savedTarget={},program={program:{},isReady(){return this.ready;},ready:false},context={isContextLost:()=>false},renderer={info:{programs:[program]},domElement:new EventTarget(),getContext:()=>context,resolve:()=>program.ready=true,target:savedTarget,clippingPlanes:[],localClippingEnabled:false,autoClear:false,toneMapping:T.ACESFilmicToneMapping,xr:{enabled:true},viewport:new T.Vector4(2,3,300,200),scissor:new T.Vector4(4,5,100,80),scissorTest:true,color:new T.Color('red'),alpha:.4,
 getRenderTarget(){return this.target;},getViewport(v){return v.copy(this.viewport);},getScissor(v){return v.copy(this.scissor);},getScissorTest(){return this.scissorTest;},getClearColor(v){return v.copy(this.color);},getClearAlpha(){return this.alpha;},setRenderTarget(t){this.target=t;},setViewport(v){this.viewport.copy(v);},setScissor(v){this.scissor.copy(v);},setScissorTest(v){this.scissorTest=v;},setClearColor(v,a){this.color.copy(v);this.alpha=a;},
 render(scene){calls.push(['initialize',scene.children.length,this.target,this.clippingPlanes.length]);},
 compile(root,camera,scene){calls.push(['compile',root,camera,scene,this.target,this.clippingPlanes.length,this.localClippingEnabled]);return new Set([material]);}};
 const material=new T.MeshStandardMaterial(),variants=new Map([['main',program]]);renderer.properties={get:value=>value===material?{programs:variants}:undefined};
 const root=new T.Group(),scene=new T.Scene(),camera=new T.PerspectiveCamera();root.add(new T.Mesh(new T.BoxGeometry(),material));scene.fog=new T.FogExp2();return {renderer,calls,savedTarget,root,scene,camera,material,variants};
}
test('program preparation compiles real pass parameters without rendering world content and restores before await',async()=>{
 const f=fixture(),target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType}),planes=[new T.Plane(new T.Vector3(0,0,1))];
 const pending=compileWebGLRepositoryPass({...f,targetScene:f.scene,target,clippingPlanes:planes});
 assert.deepEqual(f.calls[0].slice(0,2),['initialize',0]);assert.notEqual(f.calls[0][2],null,'initialization never clears visible output');assert.equal(f.calls[0][3],1);
 assert.deepEqual(f.calls[1],['compile',f.root,f.camera,f.scene,target,1,true]);
 assert.equal(f.renderer.target,f.savedTarget);assert.equal(f.renderer.clippingPlanes.length,0);assert.equal(f.renderer.autoClear,false);assert.equal(f.renderer.xr.enabled,true);assert.equal(f.renderer.scissorTest,true);assert.deepEqual(f.renderer.viewport.toArray(),[2,3,300,200]);
 f.renderer.resolve();await pending;target.dispose();
});
test('main signature compiles on the default framebuffer while clipping initialization remains offscreen',async()=>{
 const f=fixture(),pending=compileWebGLRepositoryPass({...f,targetScene:f.scene});assert.equal(f.calls[1][4],null);assert.equal(f.calls[1][5],0);assert.equal(f.calls[0][2].isWebGLRenderTarget,true);f.renderer.resolve();await pending;
});
test('synchronous compilation failure restores renderer state',()=>{
 const f=fixture();f.renderer.compile=()=>{throw Error('compile failure');};assert.throws(()=>compileWebGLRepositoryPass({...f,targetScene:f.scene}),/compile failure/);assert.equal(f.renderer.target,f.savedTarget);assert.equal(f.renderer.xr.enabled,true);assert.equal(f.renderer.scissorTest,true);
});

test('captures both transparent-face program handles without following mutable renderer lists',async()=>{
 const f=fixture(),front=f.renderer.info.programs[0],back={program:{},ready:false,isReady(){return this.ready;}};front.ready=true;f.material.transparent=true;f.material.side=T.DoubleSide;f.variants.set('back',back);f.renderer.info.programs.push(back);
 const pending=compileWebGLRepositoryPass({...f,targetScene:f.scene});let done=false;pending.then(()=>done=true);
 f.renderer.info.programs=[];f.variants.clear();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(done,false,'second captured face still compiling');back.ready=true;await pending;
});
test('unrelated unresolved and retired renderer programs are never queried',async()=>{
 const f=fixture();f.renderer.resolve();
 let foreignQueries=0;
 f.renderer.info.programs.push(
  {program:{},isReady(){foreignQueries++;return false;}},
  {program:undefined,isReady(){throw Error('foreign retired wrapper queried');}}
 );
 await compileWebGLRepositoryPass({...f,targetScene:f.scene});
 assert.equal(foreignQueries,0);
});
test('deduplicates shared wrappers across participating materials and keeps every mesh variant',async()=>{
 const f=fixture(),shared=f.renderer.info.programs[0],secondMaterial=new T.MeshStandardMaterial();let sharedQueries=0,variantQueries=0;
 shared.isReady=()=>{sharedQueries++;return true;};
 const meshVariant={program:{},isReady(){variantQueries++;return true;}};
 f.root.add(new T.Mesh(new T.BoxGeometry(),f.material),new T.Mesh(new T.BoxGeometry(),secondMaterial));
 f.variants.set('second-mesh',meshVariant);
 const secondVariants=new Map([['shared',shared]]),originalCompile=f.renderer.compile;
 f.renderer.compile=function(...args){originalCompile.apply(this,args);return new Set([f.material,secondMaterial]);};
 f.renderer.properties.get=material=>({programs:material===f.material?f.variants:secondVariants});
 await compileWebGLRepositoryPass({...f,targetScene:f.scene});
 assert.equal(sharedQueries,1);assert.equal(variantQueries,1);
});
test('rejects unsupported material program contracts instead of reporting readiness',()=>{
 for(const mutate of [
  f=>{f.renderer.compile=()=>undefined;},
  f=>{f.renderer.compile=()=>new Set([undefined]);},
  f=>{delete f.renderer.properties;},
  f=>{f.renderer.properties.get=()=>undefined;},
  f=>{f.renderer.properties.get=()=>({programs:[]});},
  f=>{f.variants.clear();},
  f=>{f.variants.set('missing',undefined);},
  f=>{f.variants.set('unsupported',{program:{}});}
 ]){
  const f=fixture();mutate(f);
  assert.throws(()=>compileWebGLRepositoryPass({...f,targetScene:f.scene}),/Unsupported Three/);
  assert.equal(f.renderer.target,f.savedTarget);assert.equal(f.renderer.xr.enabled,true);
 }
});
test('empty submitted material sets need no readiness queries',async()=>{
 const f=fixture();f.renderer.compile=()=>new Set();
 await compileWebGLRepositoryPass({...f,targetScene:f.scene});
});
test('abort and context retirement reject without releasing compiler and stop all readiness polling',async()=>{
 for(const retire of [(f,c)=>c.abort(),f=>f.renderer.domElement.dispatchEvent(new Event('webglcontextlost')),f=>f.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))]){
  const f=fixture(),controller=new AbortController(),program=f.renderer.info.programs[0];let queries=0;program.isReady=()=>{queries++;return false;};
  const pending=compileWebGLRepositoryPass({...f,targetScene:f.scene,signal:controller.signal});retire(f,controller);await assert.rejects(pending,/context retired/);const atRetirement=queries;
  program.isReady=()=>{throw Error('late destroyed-program poll');};await new Promise(resolve=>setTimeout(resolve,25));assert.equal(queries,atRetirement);assert.equal(f.renderer.target,f.savedTarget);
 }
});
test('destroyed captured programs reject before readiness query and a stalled driver has a bounded deadline',async()=>{
 const f=fixture(),program=f.renderer.info.programs[0],pending=compileWebGLRepositoryPass({...f,targetScene:f.scene});program.program=undefined;program.isReady=()=>{throw Error('destroyed program was queried');};await assert.rejects(pending,/program retired/);
 const stalled=fixture();await assert.rejects(compileWebGLRepositoryPass({...stalled,targetScene:stalled.scene,timeoutMs:5}),/timed out/);
});

test('only the two pinned published world packages opt into first-trip preparation', async()=>{
 const {isQualifiedFirstTripPackage}=await import('../src/world-runtime/WebGLRepositoryPrograms.js');
 const {SHIFT_WORLD_ID,SHIFT_CONTENT_DIGEST,SHIFT_WAREHOUSE_CONTENT_DIGEST}=await import('../src/world-runtime/ShiftingWorldProfile.js');
 const warehouse='elsemesh.world:2842c4f2-93a0-4492-b942-e53e524de319';
 assert.ok(isQualifiedFirstTripPackage('published',{worldId:warehouse,contentDigest:SHIFT_WAREHOUSE_CONTENT_DIGEST}));
 assert.ok(isQualifiedFirstTripPackage('published',{worldId:SHIFT_WORLD_ID,contentDigest:SHIFT_CONTENT_DIGEST}));
 assert.equal(isQualifiedFirstTripPackage('network',{worldId:SHIFT_WORLD_ID,contentDigest:SHIFT_CONTENT_DIGEST}),false);
 assert.equal(isQualifiedFirstTripPackage('published',{worldId:warehouse,contentDigest:'edited'}),false);
 assert.equal(isQualifiedFirstTripPackage('published',{worldId:'unrelated',contentDigest:SHIFT_WAREHOUSE_CONTENT_DIGEST}),false);
});
