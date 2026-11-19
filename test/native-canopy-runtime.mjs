import test from 'node:test';import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {buildWebGLNativeIsland} from '../src/world-runtime/WebGLNativeIsland.js';
import {readNativeIslandSource} from '../src/world-runtime/NativeIslandSource.js';
import {captureNativeCanopyCollections,isCapturedNativeCanopyCollection} from '../src/world-runtime/NativeCanopyCapture.js';
const names=['palms','trees','bananas','shrubs','youngPalms','ferns','monsteras','elephantEars','heliconias','strelitzias'];
function source(records){const n=8,normal=new Uint8Array(n*n*4);return {domain:{res:n,size:8,origin:-4},coarse:{res:n,heights:new Float32Array(n*n),normal,splat:normal},grassMask:{res:n,data:normal},shore:{res:n,data:new Float32Array(n*n*4)},records,appearance:{swellDir:{x:0,y:-1}},ocean:{level:0,fft:{local:{windDirection:25}},shore:{period:9,amplitude:.34}},tiles:[],readTile:async()=>({})};}
async function runtime(records,camera){const root=new T.Group(),texture=new T.Texture(),bark={map:texture,normalMap:texture,orm:texture},native=await buildWebGLNativeIsland({project:{environment:{}},root,camera,options:{mainCamera:camera,readNativeIsland:async()=>source(records),prepareLeafAtlas:async()=>new T.Texture(),prepareVegetationAssets:async()=>({palm:bark,tree:bark,dispose(){texture.dispose();}})}});const batches=[];root.traverse(n=>{if(n.userData.nativePlantSpecies)batches.push(n);});return {root,native,batches};}
function output(r){return r.batches.map(m=>({species:m.userData.nativePlantSpecies,distant:m.userData.nativePlantDistant,count:m.count,words:[m.instanceMatrix,m.geometry.getAttribute('iPlant'),m.geometry.getAttribute('iRecord')].map((a,i)=>Array.from(new Uint32Array(a.array.buffer,a.array.byteOffset,m.count*(i?4:16)))),versions:[m.instanceMatrix.version,m.geometry.getAttribute('iPlant').version,m.geometry.getAttribute('iRecord').version]}));}
test('real batching preserves exact legacy words/counts/dirties and proof restoration while near/far share only this invocation query',async()=>{
 const camera=new T.PerspectiveCamera(75,1,.1,3000),portal=camera.clone(),records=Object.fromEntries(names.map(n=>[n,[]]));
 for(let i=0;i<900;i++)records.trees.push({x:(i*37)%1800-900,y:i%9,z:(i*71)%1800-900,s:.7+(i%5)/10,sy:i%2?-.7:1.1,yaw:i*.17,H:12.5,la:.1,l:.2,seed:i/901});
 for(let i=0;i<400;i++)records.shrubs.push({...records.trees[i],H:4,seed:i/401});records.palms=[{x:0,y:0,z:-80,s:1,yaw:-0,H:8,seed:.3}];
 const legacy=await runtime(records,camera),indexed=await runtime(captureNativeCanopyCollections(records),camera),walls=[];
 for(const r of [legacy,indexed]){const wall=new T.Mesh(new T.BoxGeometry(200,100,.5),new T.MeshStandardMaterial());wall.position.set(0,10,-20);r.root.add(wall);walls.push(wall);}
 try{
  assert.equal(indexed.native.stats().plants.canopyIndex.length,5);assert.deepEqual(legacy.native.stats().plants.canopyIndex,[]);
  for(let step=0;step<14;step++){
   const view=step%2?portal:camera;view.clearViewOffset();view.position.set(step===11?9000:step*3,3,step===11?9000:10);view.lookAt(view.position.x-20,2,view.position.z-100);if(step%3===1)view.setViewOffset(1000,1000,step%2?750:0,0,250,1000);view.updateMatrixWorld();
   if(step===3)for(const [i,r]of [legacy,indexed].entries())r.native.setPlantOccluders([walls[i]]);
   if(step===7)for(const r of [legacy,indexed])r.native.setPlantOcclusionEnabled(false);
   if(step===9)for(const r of [legacy,indexed])r.native.setPlantOcclusionEnabled(true);
   const before=indexed.native.stats().plants.canopyIndex.map(s=>s.queries);legacy.native.bindView(view);indexed.native.bindView(view);
   assert.deepEqual(output(indexed),output(legacy),'exact old output and independent dirty flags '+step);
   const a=legacy.native.stats().plants.occlusion,b=indexed.native.stats().plants.occlusion;assert.deepEqual(b,a,'unchanged actual double-precision proof '+step);
   indexed.native.stats().plants.canopyIndex.forEach((s,i)=>assert.equal(s.queries,before[i]+1,'one query for both near/far'));
   const queries=indexed.native.stats().plants.canopyIndex.map(s=>s.queries);indexed.native.bindView(view);assert.deepEqual(indexed.native.stats().plants.canopyIndex.map(s=>s.queries),queries,'existing same-view early return precedes query generation');
  }
 }finally{legacy.native.dispose();indexed.native.dispose();for(const w of walls){w.geometry.dispose();w.material.dispose();}}
 assert.ok(indexed.native.stats().plants.canopyIndex.every(s=>s.disposed&&s.retainedBytes===0));
});
test('custom mutable/getter collections preserve legacy collection reads and per-record behavior',async()=>{
 const camera=new T.PerspectiveCamera(75,1,.1,3000),portal=camera.clone(),records=Object.fromEntries(names.map(n=>[n,[]]));let collections=0,xReads=0,x=0;
 const row={get x(){xReads++;return x;},y:0,z:-80,s:1,sy:1,yaw:0,H:12.5,seed:.1};Object.defineProperty(records,'trees',{get(){collections++;return [row];},enumerable:true});
 const r=await runtime(records,camera);assert.equal(collections,3,'one read inside each original tree variant');assert.equal(xReads,0,'no eligibility/index record probe at construction');
 try{camera.updateMatrixWorld();r.native.bindView(camera);assert.equal(xReads,4,'legacy near distance plus far distance/sphere/pose');x=20;portal.updateMatrixWorld();r.native.bindView(portal);assert.equal(xReads,8);const active=r.batches.find(m=>m.userData.nativePlantSpecies==='trees'&&m.count);assert.equal(active.instanceMatrix.array[12],20);assert.deepEqual(r.native.stats().plants.canopyIndex,[]);}finally{r.native.dispose();}
});
test('exported source reader opts into owned copies explicitly and leaves readResource payload rows unchanged',async()=>{
 const resources=[],payloads=new Map(),add=(channel,level,channels,format,data)=>{const id=channel+level;resources.push({id,channel,level,x:0,z:0,width:level?2:4,height:level?2:4,channels,format,bytes:data.byteLength??100});payloads.set(id,data);};
 for(const level of [0,1]){add('height',level,1,'f32le',new Float32Array(level?4:16));add('normal',level,4,'u8',new Uint8Array(level?16:64));add('splat',level,4,'u8',new Uint8Array(level?16:64));}add('shore',1,4,'f32le',new Float32Array(16));add('grass',1,4,'u8',new Uint8Array(16));
 const records=Object.fromEntries(names.map(n=>[n,[]])),row={x:-0,y:0,z:1,s:1,yaw:0,seed:.2};records.trees.push(row);add('vegetation',0,1,'vegetation-json',{records});const project={nativeIsland:{schema:'elsemesh.native-island/1',vegetationRecipe:'elsemesh.native-vegetation/1',grid:{resolution:4,size:4,origin:[-2,-2]},resources,sea:{appearance:{}}}},reader=async id=>({ref:resources.find(r=>r.id===id),data:payloads.get(id)});
 const legacy=await readNativeIslandSource(project,reader),owned=await readNativeIslandSource(project,reader,{captureCanopy:true});
 assert.equal(legacy.records.trees[0],row);assert.equal(Object.isFrozen(row),false);assert.equal(Object.isFrozen(records.trees),false);assert.ok(isCapturedNativeCanopyCollection(owned.records.trees));assert.notEqual(owned.records.trees[0],row);row.x=5;assert.ok(Object.is(owned.records.trees[0].x,-0));assert.equal(legacy.records.trees[0].x,5);legacy.dispose();owned.dispose();
});
