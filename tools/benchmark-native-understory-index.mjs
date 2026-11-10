// CPU-only baseline/candidate measurement against the unmodified captured records.
// Usage: node tools/benchmark-native-understory-index.mjs path/to/vegetation.bin
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {nativePlantPoseMatrix} from '../src/world-runtime/WebGLNativeIsland.js';
import {createNativeUnderstoryIndex} from '../src/world-runtime/NativeUnderstoryIndex.js';
const bytes=await readFile(process.argv[2]),{records}=JSON.parse(bytes);
const ranges={youngPalms:140,ferns:58,bananas:120,monsteras:105,elephantEars:105,heliconias:105,strelitzias:105};
const batches=Object.entries(ranges).flatMap(([species,radius])=>(species==='bananas'?[records[species].filter(r=>r.seed<.5),records[species].filter(r=>r.seed>=.5)]:[records[species]]).map(records=>({species,radius,records,index:createNativeUnderstoryIndex(records,radius)})));
const path=Array.from({length:64},(_,i)=>({x:64+i*4,z:-62-i*6})),camera=new T.PerspectiveCamera(75,1,.05,3000),frustum=new T.Frustum(),vp=new T.Matrix4(),sphere=new T.Sphere(),matrix=new T.Matrix4();
let fullScanTests=0,candidateTests=0,selected=0;
for(let step=0;step<path.length;step++){
 const p=path[step];camera.clearViewOffset();camera.position.set(p.x,12,p.z);camera.lookAt(p.x-20,3,p.z-70);if(step%2)camera.setViewOffset(1400,900,step*7%700,step*11%400,700,400);camera.updateMatrixWorld();frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 for(const batch of batches){
  const capture=candidates=>{const ids=[],poses=[];for(let j=0,n=candidates?.length??batch.records.length;j<n;j++){
   const i=candidates?candidates[j]:j,r=batch.records[i];if(Math.hypot(r.x-p.x,r.z-p.z)>batch.radius)continue;
   sphere.center.set(r.x,r.y+(r.H??5)*.5,r.z);sphere.radius=Math.max(4,r.H??0)*r.s+4;if(!frustum.intersectsSphere(sphere))continue;
   ids.push(i);nativePlantPoseMatrix(r,matrix,false);poses.push(...new Float32Array(matrix.elements));
  }return{ids,poses};};
  const candidates=batch.index?.query(p.x,p.z),baseline=capture(null),indexed=capture(candidates);assert.deepEqual(indexed,baseline,'actual source order/poses at step '+step+' '+batch.species);fullScanTests+=batch.records.length;candidateTests+=candidates?.length??batch.records.length;selected+=baseline.ids.length;
 }
}
// Isolate the replaced candidate/radius loop. Same Math.hypot comparisons; include query/sort.
function run(indexed){let count=0;for(const p of path)for(const b of batches){const ids=indexed?b.index?.query(p.x,p.z):null;for(let j=0,n=ids?.length??b.records.length;j<n;j++){const r=b.records[ids?ids[j]:j];if(Math.hypot(r.x-p.x,r.z-p.z)<=b.radius)count++;}}return count;}
for(let i=0;i<4;i++){run(false);run(true);}
const baseline=[],indexed=[];let count;
for(let i=0;i<10;i++){let start=performance.now();count=run(false);baseline.push((performance.now()-start)/path.length);start=performance.now();assert.equal(run(true),count);indexed.push((performance.now()-start)/path.length);}
const mean=a=>a.reduce((n,x)=>n+x,0)/a.length;
console.log(JSON.stringify({fixture:'Actual captured native understory; CPU loop only, not frame rate',payloadSHA256:createHash('sha256').update(bytes).digest('hex'),records:Object.fromEntries(Object.entries(records).map(([k,a])=>[k,a.length])),views:path.length,first:path[0],last:path.at(-1),alternateCrops:32,fullScanTests,candidateTests,reduction:1-candidateTests/fullScanTests,visibleSelected: selected,selectionAndFloat32Poses:'exact per-view equality in authoritative source order',meanBaselineMsPerView:mean(baseline),meanIndexedMsPerView:mean(indexed),timingSamples:{baseline,indexed}},null,2));
