import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';import {repositorySceneOptions} from '../src/world-runtime/RepositorySceneOptions.js';import {nativeIslandSceneOptions} from '../src/world-runtime/NativeIslandIntegration.js';import {isCapturedNativeCanopyCollection,filterNativeCanopyCollection} from '../src/world-runtime/NativeCanopyCapture.js';import {createNativeCanopyIndex} from '../src/world-runtime/NativeCanopyIndex.js';import {buildWebGLNativeIsland} from '../src/world-runtime/WebGLNativeIsland.js';
const directory=process.env.FRED_CANOPY_WORLD,evidence=process.env.FRED_CANOPY_CAMERA_EVIDENCE;
test('verified default WebGL reader uses the owned index; WebGPU and direct default integration stay uncaptured',{skip:!directory?'Set FRED_CANOPY_WORLD to an exact local published native package':false},async()=>{
 const manifest=JSON.parse(await readFile(join(directory,'world.json'),'utf8')),project={...JSON.parse(await readFile(join(directory,manifest.components.connections.path),'utf8')),environment:{windSpeed:7}},loaded={identity:{worldId:manifest.world.worldId,contentDigest:'local-fixture'},nativeIslandRead:async path=>new Uint8Array(await readFile(join(directory,path)))},camera=new T.PerspectiveCamera(75,1,.06,4000),options=repositorySceneOptions(project,loaded,{backend:'webgl2',camera});
 const original=options.nativeIsland.readNativeIsland;let captured;options.nativeIsland.readNativeIsland=async(...args)=>(captured=await original(...args));
 const root=new T.Group(),texture=new T.Texture(),bark={map:texture,normalMap:texture,orm:texture};Object.assign(options.nativeIsland,{prepareLeafAtlas:async()=>new T.Texture(),prepareVegetationAssets:async()=>({palm:bark,tree:bark,dispose(){texture.dispose();}})});
 const native=await buildWebGLNativeIsland({project,root,camera,options:options.nativeIsland});
 try{
  assert.ok(isCapturedNativeCanopyCollection(captured.records.trees));assert.ok(Object.isFrozen(captured.records.trees[0]));camera.position.set(64,12,-45);camera.lookAt(0,60,-400);camera.updateMatrixWorld();native.bindView(camera);const stats=native.stats();assert.equal(stats.plants.canopyIndex.length,5);assert.ok(stats.plants.canopyIndex.every(s=>s.queries===1&&s.retainedBytes>0));assert.equal(stats.source.ownedCanopyRecords,captured.records.trees.length+captured.records.shrubs.length);
  if(evidence){
   const data=JSON.parse(await readFile(evidence,'utf8')),sphere=new T.Sphere();let views=0;
   for(const species of ['trees','shrubs'])for(let variant=0;variant<(species==='trees'?3:2);variant++){
    const variants=species==='trees'?3:2,rows=filterNativeCanopyCollection(captured.records[species],r=>Math.floor((r.seed*7.77-Math.floor(r.seed*7.77))*variants)===variant),index=createNativeCanopyIndex(rows),near=species==='trees'?65:45;
    for(const view of data.views){const snap=view.camera,frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(new T.Matrix4().fromArray(snap.projection),new T.Matrix4().fromArray(snap.matrixWorld).invert())),q=index.query(frustum);for(const distant of [false,true]){
     const select=ids=>{const result=[];for(const i of ids){const r=rows[i],distance=Math.hypot(r.x-snap.position[0],r.z-snap.position[2]);if(distance>2800||(distant?distance<near:distance>=near))continue;sphere.center.set(r.x,r.y+(r.H??5)*.5,r.z);sphere.radius=Math.max(4,r.H??0)*r.s+4;if(frustum.intersectsSphere(sphere))result.push(i);}return result;};
     assert.deepEqual(select(q?Array.from(q.ids.subarray(0,q.count)):rows.map((_,i)=>i)),select(rows.map((_,i)=>i)),'captured ordered selector '+[species,variant,view.arm,view.phase,view.frame,distant]);views++;
    }}index.dispose();
   }assert.equal(views,data.views.length*10);
   const meshes=[];root.traverse(n=>{if(n.userData.nativePlantSpecies)meshes.push(n);});
   const specs={palms:[120,2800,false],youngPalms:[0,140,false],ferns:[0,58,false],bananas:[0,120,false],monsteras:[0,105,false],elephantEars:[0,105,false],heliconias:[0,105,false],strelitzias:[0,105,false],trees:[65,2800,true],shrubs:[45,2800,true]},positions=new Map(),metadata=meshes.map(mesh=>{const species=mesh.userData.nativePlantSpecies,[near,far,canopy]=specs[species],i=positions.get(species)??0;positions.set(species,i+1);return {mesh,species,near,far,canopy,variant:Math.floor(i/(near?2:1))};}),alternate=camera.clone();
   for(const view of data.views){
    const snap=view.camera,actual=view.role==='main'?camera:alternate;actual.matrixAutoUpdate=false;actual.matrix.fromArray(snap.matrixWorld);actual.position.fromArray(snap.position);actual.projectionMatrix.fromArray(snap.projection);actual.projectionMatrixInverse.copy(actual.projectionMatrix).invert();actual.matrixWorldNeedsUpdate=true;actual.updateMatrixWorld(true);native.bindView(actual);
    const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(actual.projectionMatrix,actual.matrixWorldInverse));
    for(const {mesh,species,near,far,canopy,variant}of metadata){const expected=[[],[],[]],variants=species==='trees'?3:species==='shrubs'||species==='bananas'?2:1;
     for(const r of captured.records[species]){
      if(canopy&&Math.floor((r.seed*7.77-Math.floor(r.seed*7.77))*variants)!==variant||species==='bananas'&&(r.seed<.5?0:1)!==variant)continue;
      const distance=Math.hypot(r.x-actual.position.x,r.z-actual.position.z);if(distance>far||near&&(mesh.userData.nativePlantDistant?distance<near:distance>=near))continue;sphere.center.set(r.x,r.y+(r.H??5)*.5,r.z);sphere.radius=Math.max(4,r.H??0)*r.s+4;if(!frustum.intersectsSphere(sphere))continue;
      const matrix=new T.Matrix4().compose(new T.Vector3(r.x,r.y,r.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),r.yaw),new T.Vector3(r.s,r.s*(canopy?Math.abs(r.sy??1):1),r.s));expected[0].push(...matrix.elements);expected[1].push((r.la??0)-r.yaw,r.l??0,(species==='bananas'?.02:r.H??1)/Math.max(.001,r.s),r.seed);expected[2].push(r.yaw,r.s,canopy?1:0,0);
     }
     assert.equal(mesh.count,expected[0].length/16);[mesh.instanceMatrix,mesh.geometry.getAttribute('iPlant'),mesh.geometry.getAttribute('iRecord')].forEach((attribute,i)=>{const values=new Float32Array(expected[i]);assert.deepEqual(new Uint32Array(attribute.array.buffer,attribute.array.byteOffset,values.length),new Uint32Array(values.buffer),'independent original packed words '+[view.frame,species,variant,i]);});
    }
   }
   assert.ok(native.stats().plants.canopyIndex.some(s=>s.cellsRejected>0),'default owned index actually rejects cells in captured portal views');
  }
 }finally{native.dispose();}
 assert.ok(native.stats().plants.canopyIndex.every(s=>s.disposed&&s.retainedBytes===0));
 for(const opts of [repositorySceneOptions(project,loaded,{backend:'webgpu',camera}),nativeIslandSceneOptions(project,loaded)]){const source=await opts.nativeIsland.readNativeIsland();assert.equal(isCapturedNativeCanopyCollection(source.records.trees),false);assert.equal(Object.isFrozen(source.records.trees[0]),false);assert.equal(source.sourceStats().ownedCanopyRecords,undefined);source.dispose();}
});
