import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {buildWebGLNativeIsland,cachedNativePlantPoseWords} from '../src/world-runtime/WebGLNativeIsland.js';

const names=['palms','youngPalms','ferns','bananas','monsteras','elephantEars','heliconias','strelitzias','trees','shrubs'];
const words=array=>new Uint32Array(array.buffer,array.byteOffset,array.length);
test('captured pose word views match the old numeric roundtrip, respect offsets and reacquire replacements',()=>{
 const storage=new Uint32Array(40);storage.fill(0xdeadbeef);
 const source=storage.subarray(4,36);for(let i=0;i<source.length;i++)source[i]=[0,0x80000000,0x7f800000,0xff800000,0x00000001,0x807fffff,0x3f800001,0xbf7fffff][i%8];
 const poses=new Float32Array(storage.buffer,source.byteOffset,source.length),cache={poses},view=cachedNativePlantPoseWords(cache);
 assert.equal(view.buffer,poses.buffer);assert.equal(view.byteOffset,poses.byteOffset);assert.equal(view.length,poses.length);assert.equal(cachedNativePlantPoseWords(cache),view,'cohort shares its view');
 for(const offset of [0,16]){const old=new Float32Array(16);new T.Matrix4().fromArray(poses,offset).toArray(old);assert.deepEqual(view.subarray(offset,offset+16),words(old),'old cached conversion words at record '+offset/16);}
 const replacement=new Float32Array(poses);cache.poses=replacement;const next=cachedNativePlantPoseWords(cache);assert.notEqual(next,view);assert.equal(next.buffer,replacement.buffer);
 for(const payload of [0x7f800001,0x7fc12345,0xff800001,0xffc12345]){
  const nanStorage=new Uint32Array(20);nanStorage.set(next.subarray(0,16),2);nanStorage[5]=payload;cache.poses=new Float32Array(nanStorage.buffer,8,16);
  assert.equal(cachedNativePlantPoseWords(cache),null,'NaN cohort keeps the original numeric path');assert.equal(cachedNativePlantPoseWords(cache),null,'NaN fallback remains cached');
  const old=new Float32Array(16);new T.Matrix4().fromArray(cache.poses).toArray(old);assert.ok(Number.isNaN(old[3]));
 }
 cache.poses=poses;assert.deepEqual(cachedNativePlantPoseWords(cache),view,'finite replacement rescans after NaN fallback');
 cache.poses=null;assert.equal(cachedNativePlantPoseWords(cache),null);assert.equal(cache.poseWordSource,null);assert.equal(cache.poseWords,null,'clearing poses releases the old view and its array reference');
 cache.poses=poses;const reacquired=cachedNativePlantPoseWords(cache);assert.notEqual(reacquired,view);assert.equal(reacquired.buffer,poses.buffer);assert.deepEqual(reacquired,view);
});
// Independent reference to the pre-gating expressions and writes. No runtime pose helper.
function oldOutput(records,species,variant,distant,camera){
 const canopy=species==='trees'||species==='shrubs',near=species==='palms'?120:species==='trees'?65:species==='shrubs'?45:0;
 const far=near?2800:({youngPalms:140,ferns:58,bananas:120,monsteras:105,elephantEars:105,heliconias:105,strelitzias:105})[species];
 const variants=species==='trees'?3:species==='shrubs'||species==='bananas'?2:1;
 const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)),sphere=new T.Sphere(),matrix=[],plant=[],record=[];
 for(const r of records){
  if(canopy&&Math.floor((r.seed*7.77-Math.floor(r.seed*7.77))*variants)!==variant||species==='bananas'&&(r.seed<.5?0:1)!==variant)continue;
  const distance=Math.hypot(r.x-camera.position.x,r.z-camera.position.z);
  if(distance>far||near&&(distant?distance<near:distance>=near))continue;
  sphere.center.set(r.x,r.y+(r.H??5)*.5,r.z);sphere.radius=Math.max(4,r.H??0)*r.s+4;if(!frustum.intersectsSphere(sphere))continue;
  const pose=new T.Matrix4().compose(new T.Vector3(r.x,r.y,r.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),r.yaw),new T.Vector3(r.s,r.s*(canopy?Math.abs(r.sy??1):1),r.s));
  matrix.push(...pose.elements);plant.push((r.la??0)-r.yaw,r.l??0,(species==='bananas'?.02:r.H??1)/Math.max(.001,r.s),r.seed);record.push(r.yaw,r.s,canopy?1:0,0);
 }
 return [new Float32Array(matrix),new Float32Array(plant),new Float32Array(record)];
}

test('native output gating preserves old Float32 words and independent dirty versions through view changes',async()=>{
 const root=new T.Group(),main=new T.PerspectiveCamera(75,1,.05,3000),a=main.clone(),b=main.clone(),n=8;
 const records=Object.fromEntries(names.map(name=>[name,[]]));
 for(const species of names)for(const seed of [.01,.06,.11,.2,.8])for(const [i,z]of [-20,-80,-160].entries()){
  records[species].push({x:i===0?-0:i===1?-12:12,y:i===0?-0:0,z,s:i===0?1:i===1?1.00000003:-.1,yaw:i===0?-0:.30000000000000004,sy:i===0?undefined:-.70000001,seed,H:i===0?undefined:i===1?null:12.5,la:i===0?-0:undefined,l:i===0?-0:i===1?null:.10000000000000002});
 }
 const normal=new Uint8Array(n*n*4),splat=new Uint8Array(n*n*4),source={domain:{res:n,size:n,origin:-4},coarse:{res:n,heights:new Float32Array(n*n),normal,splat},grassMask:{res:n,data:normal},shore:{res:n,data:new Float32Array(n*n*4)},records,appearance:{swellDir:{x:0,y:-1}},ocean:{level:0,fft:{local:{windDirection:25}},shore:{period:9,amplitude:.34}},tiles:[],readTile:async()=>{throw Error('No CPU fixture tiles');}};
 const texture=new T.Texture(),bark={map:texture,normalMap:texture,orm:texture};
 const native=await buildWebGLNativeIsland({project:{environment:{}},root,camera:main,options:{mainCamera:main,readNativeIsland:async()=>source,prepareLeafAtlas:async()=>new T.Texture(),prepareVegetationAssets:async()=>({palm:bark,tree:bark,dispose(){texture.dispose();}})}});
 try{
  const meshes=[];root.traverse(node=>{if(node.userData.nativePlantSpecies)meshes.push(node);});assert.equal(meshes.length,20);
  const variantIndex=new Map(),metadata=meshes.map(mesh=>{const species=mesh.userData.nativePlantSpecies,hasFar=['palms','trees','shrubs'].includes(species),index=variantIndex.get(species)??0;variantIndex.set(species,index+1);return {mesh,species,variant:Math.floor(index/(hasFar?2:1)),distant:mesh.userData.nativePlantDistant};});
  // First upload, recomputed same output, asymmetric subset/repack, A-B-A, zero,
  // growth from retained tails, main/alternate identities, and near/far changes.
  const steps=[[a,0,10,null],[b,.001,10,null],[a,0,10,[0,0,500,1000]],[b,0,10,null],[a,0,10,[500,0,500,1000]],[a,0,10,null],[b,10000,10000,null],[a,0,10,null],[main,0,-90,null],[b,0,10,null]];
  let nonempty=0,changed=0,unchanged=0,negativeZero=false;
  for(const [step,[camera,x,z,crop]]of steps.entries()){
   if(step===3){
    // This actual proof initializes shared near/far Float32 poses while its wall
    // lies behind every source plant, so the independent selection stays valid.
    const wall=new T.Mesh(new T.BoxGeometry(100,100,.5),new T.MeshStandardMaterial());wall.position.z=-500;root.add(wall);native.setPlantOccluders([wall]);
    main.position.set(0,3,10);main.lookAt(0,2,-90);main.updateMatrixWorld();native.bindView(main);
    assert.ok(native.stats().plants.occlusion.retainedBytes>0,'real main proof creates cached cohort poses');
    native.setPlantOccluders([]);wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();
   }
   camera.clearViewOffset();camera.position.set(x,3,z);camera.lookAt(x,2,z-100);if(crop)camera.setViewOffset(1000,1000,...crop);camera.updateMatrixWorld();
   const before=metadata.map(({mesh})=>[mesh.instanceMatrix,mesh.geometry.getAttribute('iPlant'),mesh.geometry.getAttribute('iRecord')].map(attr=>({version:attr.version,bytes:words(attr.array).slice()})));
   const expected=metadata.map(({species,variant,distant})=>oldOutput(records[species],species,variant,distant,camera));
   native.bindView(camera);
   metadata.forEach(({mesh,species},i)=>{
    const attrs=[mesh.instanceMatrix,mesh.geometry.getAttribute('iPlant'),mesh.geometry.getAttribute('iRecord')];assert.equal(mesh.count,expected[i][0].length/16,species+' count at '+step);if(mesh.count)nonempty++;
    attrs.forEach((attr,j)=>{const wanted=words(expected[i][j]),actual=words(attr.array).subarray(0,wanted.length),dirty=wanted.some((v,k)=>v!==before[i][j].bytes[k]);assert.deepEqual(actual,wanted,species+' exact ordered words '+step+'/'+j);assert.equal(attr.version,before[i][j].version+(dirty?1:0),species+' independent dirty version '+step+'/'+j);if(dirty)changed++;else unchanged++;if(wanted.includes(0x80000000))negativeZero=true;});
   });
  }
  assert.ok(nonempty&&changed&&unchanged&&negativeZero,'fixture exercises writes, preserved versions, and signed zero');
  // Another writer's already-pending version must survive an identical recompute.
  const mesh=meshes.find(m=>m.count),attr=mesh.instanceMatrix;attr.needsUpdate=true;const pending=attr.version;
  a.position.copy(b.position);a.quaternion.copy(b.quaternion);a.clearViewOffset();a.updateMatrixWorld();native.bindView(a);assert.equal(attr.version,pending);
  const attrs=[mesh.instanceMatrix,mesh.geometry.getAttribute('iPlant'),mesh.geometry.getAttribute('iRecord')];
  for(let dirty=0;dirty<attrs.length;dirty++){
   const original=words(attrs[dirty].array)[0];words(attrs[dirty].array)[0]^=1;
   const versions=attrs.map(attribute=>attribute.version);
   // Force recomputation via the alternate camera identity, without changing selection.
   native.bindView(dirty%2? a:b);
   assert.equal(words(attrs[dirty].array)[0],original,'fresh expressions repair the changed destination word');
   attrs.forEach((attribute,i)=>assert.equal(attribute.version,versions[i]+(i===dirty?1:0),'only the changed attribute uploads'));
  }
  const plant=attrs[1],storage=new Float32Array(plant.array.length+8);storage.set(plant.array,4);plant.array=storage.subarray(4,-4);
  const version=plant.version;native.bindView(a);assert.equal(plant.version,version,'replaced offset destination with identical words needs no upload');
 }finally{native.dispose();}
 assert.equal(root.children.length,0);
});
