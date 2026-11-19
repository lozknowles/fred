import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {captureNativeCanopyCollections,isCapturedNativeCanopyCollection,filterNativeCanopyCollection} from '../src/world-runtime/NativeCanopyCapture.js';
import {createNativeCanopyIndex,NATIVE_CANOPY_INDEX_POLICY} from '../src/world-runtime/NativeCanopyIndex.js';
const capture=rows=>captureNativeCanopyCollections({trees:rows,shrubs:[]}).trees;
function selected(rows,camera,distant,near=65,far=2800,ids=rows.map((_,i)=>i)){
 const f=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)),s=new T.Sphere(),result=[];
 for(const i of ids){const r=rows[i],d=Math.hypot(r.x-camera.position.x,r.z-camera.position.z);if(d>far||(distant?d<near:d>=near))continue;s.center.set(r.x,r.y+(r.H??5)*.5,r.z);s.radius=Math.max(4,r.H??0)*r.s+4;if(f.intersectsSphere(s))result.push(i);}return result;
}
const frustum=c=>new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse));
test('capture owns exact scalar copies and frozen memberships; custom collections are never probed for eligibility',()=>{
 const row={x:-0,y:0,z:-30,s:1,yaw:-0,seed:.1,sy:undefined},input={trees:[row],shrubs:[],palms:[row]},owned=captureNativeCanopyCollections(input);
 assert.notEqual(owned.trees,input.trees);assert.notEqual(owned.trees[0],row);assert.ok(Object.is(owned.trees[0].x,-0));assert.ok(Object.hasOwn(owned.trees[0],'sy'));assert.ok(Object.isFrozen(owned.trees)&&Object.isFrozen(owned.trees[0]));assert.equal(owned.palms,input.palms);assert.equal(Object.isFrozen(row),false);row.x=90;input.trees.push(row);assert.equal(owned.trees.length,1);assert.ok(Object.is(owned.trees[0].x,-0));
 assert.throws(()=>owned.trees.push(row));assert.throws(()=>owned.trees[0].x=1);const cohort=filterNativeCanopyCollection(owned.trees,()=>true);assert.ok(isCapturedNativeCanopyCollection(cohort));assert.ok(Object.isFrozen(cohort));
 owned.trees=[...owned.trees];assert.equal(createNativeCanopyIndex(owned.trees),null,'replacement is not owned');assert.equal(createNativeCanopyIndex(new Proxy([],{get(){throw Error('custom proxy probed');}})),null);
});
test('fixed conservative cells preserve independent ordered near/far selection for random cameras, crops and boundaries',()=>{
 let seed=731;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 const rows=Array.from({length:1800},(_,i)=>({x:random()*2048-1024,y:random()*180-10,z:random()*2048-1024,s:.2+random()*2,H:i%11?random()*35:undefined,seed:random(),yaw:random()*6}));
 for(const x of [-128,0,128])for(const z of [-2800,-65,-65-1e-12,-65+1e-12,65,2800])rows.push({x,y:-0,z,s:1,H:0,seed:.1,yaw:-0});
 const owned=capture(rows),index=createNativeCanopyIndex(owned),camera=new T.PerspectiveCamera(65,16/9,.06,4000),initialBytes=index.stats().retainedBytes;let reused;
 for(let step=0;step<120;step++){
  camera.clearViewOffset();camera.position.set(random()*1200-600,random()*100,random()*1200-600);camera.lookAt(random()*1200-600,random()*100,random()*1200-600);if(step%3)camera.setViewOffset(1600,900,step%2?0:1100,step%4?0:500,500,400);camera.updateMatrixWorld();
  const q=index.query(frustum(camera));if(q){if(reused)assert.equal(q,reused);reused=q;for(let j=1;j<q.count;j++)assert.ok(q.ids[j]>q.ids[j-1]);}
  for(const distant of [false,true])assert.deepEqual(selected(owned,camera,distant,65,2800,q?Array.from(q.ids.subarray(0,q.count)):undefined),selected(owned,camera,distant),'ordered reference '+step+'/'+distant);
  assert.equal(index.stats().retainedBytes,initialBytes);
 }
 assert.ok(initialBytes<=NATIVE_CANOPY_INDEX_POLICY.maxBytes);assert.equal(index.stats().queries,120);index.dispose();assert.equal(index.stats().retainedBytes,0);assert.equal(index.query(frustum(camera)),null);
});
test('touching planes remain conservative; dense, invalid, empty and large inputs fall back without truncation',()=>{
 const planes=()=>new T.Frustum(...Array.from({length:6},()=>new T.Plane(new T.Vector3(1,0,0),1e20))),all=planes();
 const dense=createNativeCanopyIndex(capture(Array.from({length:80},(_,i)=>({x:i,y:0,z:-80,s:1,H:1}))));assert.equal(dense.query(all),null);assert.equal(dense.stats().denseFallbacks,1);
 const empty=createNativeCanopyIndex(capture([]));assert.equal(empty.query(all).count,0);assert.equal(empty.stats().lastCandidates,0);
 const invalid=createNativeCanopyIndex(capture([{x:NaN,y:0,z:0,s:1,H:1}]));assert.equal(invalid.query(all),null);assert.equal(invalid.stats().reason,'invalid-record');
 const boxed=createNativeCanopyIndex(capture([{x:0,y:0,z:0,s:{valueOf(){throw Error('mutable scalar coerced');}},H:1}]));assert.equal(boxed.query(all),null);assert.equal(boxed.stats().reason,'invalid-record');
 const large=createNativeCanopyIndex(capture([{x:1e300,y:0,z:0,s:1,H:1}]));assert.equal(large.query(all),null);
 const normal=createNativeCanopyIndex(capture([{x:0,y:0,z:0,s:1,H:0},{x:-1024,y:0,z:0,s:1,H:0},{x:-512,y:0,z:0,s:1,H:0},{x:-256,y:0,z:0,s:1,H:0}]));const touching=planes();touching.planes[0].constant=-8;const q=normal.query(touching);assert.ok(q&&Array.from(q.ids.subarray(0,q.count)).includes(0),'sphere tangent is retained');touching.planes[0].normal.x=Infinity;assert.equal(normal.query(touching),null);
 const manyCells=createNativeCanopyIndex(capture(Array.from({length:NATIVE_CANOPY_INDEX_POLICY.maxCells+1},(_,i)=>({x:i*128,y:0,z:0,s:1,H:0}))));assert.equal(manyCells.query(all),null);assert.equal(manyCells.stats().reason,'cell-limit');assert.equal(manyCells.stats().retainedBytes,0);
});
