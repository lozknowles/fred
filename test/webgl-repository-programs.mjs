import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {compileWebGLRepositoryPass} from '../src/world-runtime/WebGLRepositoryPrograms.js';

function fixture(){
 const calls=[],savedTarget={},renderer={target:savedTarget,clippingPlanes:[],localClippingEnabled:false,autoClear:false,toneMapping:T.ACESFilmicToneMapping,xr:{enabled:true},viewport:new T.Vector4(2,3,300,200),scissor:new T.Vector4(4,5,100,80),scissorTest:true,color:new T.Color('red'),alpha:.4,
 getRenderTarget(){return this.target;},getViewport(v){return v.copy(this.viewport);},getScissor(v){return v.copy(this.scissor);},getScissorTest(){return this.scissorTest;},getClearColor(v){return v.copy(this.color);},getClearAlpha(){return this.alpha;},setRenderTarget(t){this.target=t;},setViewport(v){this.viewport.copy(v);},setScissor(v){this.scissor.copy(v);},setScissorTest(v){this.scissorTest=v;},setClearColor(v,a){this.color.copy(v);this.alpha=a;},
 render(scene){calls.push(['initialize',scene.children.length,this.target,this.clippingPlanes.length]);},
 compileAsync(root,camera,scene){calls.push(['compile',root,camera,scene,this.target,this.clippingPlanes.length,this.localClippingEnabled]);return new Promise(resolve=>this.resolve=resolve);}};
 const root=new T.Group(),scene=new T.Scene(),camera=new T.PerspectiveCamera();root.add(new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()));scene.fog=new T.FogExp2();return {renderer,calls,savedTarget,root,scene,camera};
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
 const f=fixture();f.renderer.compileAsync=()=>{throw Error('compile failure');};assert.throws(()=>compileWebGLRepositoryPass({...f,targetScene:f.scene}),/compile failure/);assert.equal(f.renderer.target,f.savedTarget);assert.equal(f.renderer.xr.enabled,true);assert.equal(f.renderer.scissorTest,true);
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
