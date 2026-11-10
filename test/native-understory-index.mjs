import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {createNativeUnderstoryIndex} from '../src/world-runtime/NativeUnderstoryIndex.js';
import {buildWebGLNativeIsland,nativePlantPoseMatrix} from '../src/world-runtime/WebGLNativeIsland.js';

function selection(records,radius,camera,candidates){
 const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),frustum=new T.Frustum().setFromProjectionMatrix(vp),sphere=new T.Sphere(),ids=[],poses=[];
 const matrix=new T.Matrix4();
 for(let k=0,n=candidates?.length??records.length;k<n;k++){
  const i=candidates?candidates[k]:k,r=records[i];
  if(Math.hypot(r.x-camera.position.x,r.z-camera.position.z)>radius)continue;
  sphere.center.set(r.x,r.y+(r.H??5)*.5,r.z);sphere.radius=Math.max(4,r.H??0)*r.s+4;if(!frustum.intersectsSphere(sphere))continue;
  ids.push(i);nativePlantPoseMatrix(r,matrix,false);poses.push(...new Float32Array(matrix.elements));
 }
 return{ids,poses};
}
test('understory candidates preserve exact source IDs and Float32 poses for moving, cropped and boundary views',()=>{
 const radius=58,records=Array.from({length:2500},(_,i)=>({x:((i*37)%900)-450,y:i%29,z:((i*71)%900)-450,s:.75+(i%7)/10,yaw:i*.17,H:.02,seed:i/2500}));
 for(const [x,z]of [[-58,0],[58,0],[0,-58],[0,58],[58+Number.EPSILON*58,0],[-116,58],[0,0]])records.push({x,y:1,z,s:1,yaw:.4,H:1,seed:.3});
 const index=createNativeUnderstoryIndex(records,radius);assert.ok(index);
 const camera=new T.PerspectiveCamera(75,1,.05,3000);let reused;
 for(let step=0;step<40;step++){
  const x=step<4?[0,58,-58,116][step]:64+step*4,z=step<4?0:-62-step*6;
  camera.clearViewOffset();camera.position.set(x,12,z);camera.lookAt(x-20,3,z-70);if(step%2)camera.setViewOffset(1400,900,step*7%700,step*11%400,700,400);camera.updateMatrixWorld();
  const candidates=index.query(x,z);if(reused)assert.equal(candidates,reused,'candidate storage is reused');reused=candidates;
  assert.deepEqual(selection(records,radius,camera,candidates),selection(records,radius,camera),'exact IDs, order and poses at step '+step);
 }
 assert.equal(index.query(10000,10000).length,0);assert.equal(index.query(NaN,0),null);
});
test('empty/small, distant, canopy-range and invalid-coordinate inputs retain full scan fallback',()=>{
 assert.equal(createNativeUnderstoryIndex([],58),null);assert.equal(createNativeUnderstoryIndex(Array(255).fill({x:0,z:0}),58),null);
 const records=Array(256).fill({x:0,z:0});assert.equal(createNativeUnderstoryIndex(records,2800),null);assert.equal(createNativeUnderstoryIndex(records,0),null);
 assert.equal(createNativeUnderstoryIndex([...records,{x:NaN,z:0}],58),null);assert.equal(createNativeUnderstoryIndex([...records,{x:1e300,z:0}],58),null);
 const index=createNativeUnderstoryIndex(records,58);assert.equal(index.query(0,0).length,256);assert.equal(index.query(Infinity,0),null);
});
test('native runtime uploads the exact baseline instance order and poses across main and portal views',async()=>{
 const n=8,root=new T.Group(),camera=new T.PerspectiveCamera(75,1,.05,3000),portal=camera.clone();
 const records=Object.fromEntries(['palms','trees','bananas','shrubs','youngPalms','ferns','monsteras','elephantEars','heliconias','strelitzias'].map(name=>[name,[]]));
 records.ferns=Array.from({length:1300},(_,i)=>({x:(i*37)%400-200,y:i%9,z:(i*71)%400-200,s:.8+(i%4)/10,yaw:i*.17,H:.02,seed:i/1300}));
 const normal=new Uint8Array(n*n*4),splat=new Uint8Array(n*n*4);
 const source={domain:{res:n,size:n,origin:-4},coarse:{res:n,heights:new Float32Array(n*n),normal,splat},grassMask:{res:n,data:normal},shore:{res:n,data:new Float32Array(n*n*4)},records,appearance:{swellDir:{x:0,y:-1}},ocean:{level:0,fft:{local:{windDirection:25}},shore:{period:9,amplitude:.34}},tiles:[],readTile:async()=>{throw Error('No tiles in CPU fixture');}};
 const texture=new T.Texture(),bark={map:texture,normalMap:texture,orm:texture};
 const native=await buildWebGLNativeIsland({project:{environment:{}},root,camera,options:{mainCamera:camera,readNativeIsland:async()=>source,prepareLeafAtlas:async()=>new T.Texture(),prepareVegetationAssets:async()=>({palm:bark,tree:bark,dispose(){texture.dispose();}})}});
 try{
  let mesh;root.traverse(node=>{if(node.userData.nativePlantSpecies==='ferns')mesh=node;});assert.ok(mesh);
  for(let step=0;step<8;step++){
   const view=step%2?portal:camera,x=step===7?10000:step*17-58,z=step===7?10000:-step*13;
   view.clearViewOffset();view.position.set(x,12,z);view.lookAt(x-20,3,z-70);if(view===portal)view.setViewOffset(1400,900,step*50,step*20,700,400);view.updateMatrixWorld();
   const expected=selection(records.ferns,58,view);native.bindView(view);
   assert.equal(mesh.count,expected.ids.length);assert.deepEqual(Array.from(mesh.instanceMatrix.array.subarray(0,mesh.count*16)),expected.poses);
   assert.deepEqual(expected.ids.map(i=>Math.fround(records.ferns[i].seed)),Array.from({length:mesh.count},(_,i)=>mesh.geometry.getAttribute('iPlant').getW(i)));
  }
 }finally{native.dispose();}
});
