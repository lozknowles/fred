import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {triangleOcclusionCone,sphereBehindTriangle,createNativePlantOcclusion,nativeCanopyOcclusionSphere} from '../src/world-runtime/NativePlantOcclusion.js';
import {buildWebGLNativeIsland,nativePlantPoseMatrix} from '../src/world-runtime/WebGLNativeIsland.js';
import {buildTreeNear} from '../src/world/vegetation/PlantGeometry.js';
import {repositorySceneOptions} from '../src/world-runtime/RepositorySceneOptions.js';

const points=[[-200,-100,-20],[200,-100,-20],[0,200,-20]].map(v=>new T.Vector3(...v));
function fixture(){
 const root=new T.Scene(),camera=new T.PerspectiveCamera(75,1,.1,3000);camera.updateMatrixWorld();
 const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));
 const wall=new T.Mesh(geometry,new T.MeshStandardMaterial());root.add(wall);root.updateMatrixWorld(true);
 const occlusion=createNativePlantOcclusion(camera);occlusion.setOccluders([wall]);occlusion.prepare(camera);
 return {root,camera,wall,occlusion};
}
test('a complete sphere requires opaque nearer coverage with a margin; opening edges and near plane stay open',()=>{
 const cone=triangleOcclusionCone(...points,new T.Vector3());
 assert.ok(cone);assert.equal(sphereBehindTriangle(new T.Sphere(new T.Vector3(0,0,-80),8),cone),true);
 for(const sphere of [new T.Sphere(new T.Vector3(0,0,-10),1),new T.Sphere(new T.Vector3(0,0,-20),1),new T.Sphere(new T.Vector3(0,0,-80),1000),new T.Sphere(new T.Vector3(900,0,-80),1)])assert.equal(sphereBehindTriangle(sphere,cone),false);
 assert.equal(triangleOcclusionCone(...points.map(p=>p.clone().multiplyScalar(.001)),new T.Vector3()),null);
 // Independent ray/triangle intersection of sampled sphere surface points.
 const sphere=new T.Sphere(new T.Vector3(0,0,-80),8),hit=new T.Vector3();
 for(let i=0;i<2000;i++){
  const z=1-2*(i+.5)/2000,angle=i*2.399963229728653,p=new T.Vector3(Math.sqrt(1-z*z)*Math.cos(angle),Math.sqrt(1-z*z)*Math.sin(angle),z).multiplyScalar(sphere.radius).add(sphere.center);
  const ray=new T.Ray(new T.Vector3(),p.clone().normalize());assert.ok(ray.intersectTriangle(...points,false,hit));assert.ok(hit.length()<p.length());
 }
});
test('material/layer/visibility changes, tiny camera motion, portal views and disable all revoke proof',()=>{
 const {camera,wall,occlusion}=fixture(),sphere=new T.Sphere(new T.Vector3(0,0,-80),8);
 assert.equal(occlusion.rejects(sphere),true);const key=occlusion.signature;
 camera.position.x=.001;camera.updateMatrixWorld();occlusion.prepare(camera);assert.notEqual(occlusion.signature,key);
 const portal=camera.clone();portal.updateMatrixWorld();occlusion.prepare(portal);assert.equal(occlusion.rejects(sphere),false);
 for(const mode of ['transparent','alphaTest','visible','layers','near','oblique','compile','wireframe']){
  const f=fixture();if(mode==='transparent')f.wall.material.transparent=true;if(mode==='alphaTest')f.wall.material.alphaTest=.1;if(mode==='visible')f.wall.visible=false;if(mode==='layers')f.wall.layers.set(1);if(mode==='near'){f.camera.near=10;f.camera.updateProjectionMatrix();}if(mode==='oblique')f.camera.projectionMatrix.elements[2]=.2;if(mode==='compile')f.wall.material.onBeforeCompile=()=>{};if(mode==='wireframe')f.wall.material.wireframe=true;
  f.occlusion.prepare(f.camera);assert.equal(f.occlusion.rejects(sphere),false,mode);
 }
 occlusion.setEnabled(false);occlusion.prepare(camera);assert.equal(occlusion.rejects(sphere),false);
});
test('canopy bounds enclose every source vertex at extreme wind phases and non-uniform record height',()=>{
 const geometry=buildTreeNear().geometry,record={x:15,y:5,z:-90,s:1.8,sy:2.5,yaw:.7},matrix=nativePlantPoseMatrix(record,new T.Matrix4(),true),sphere=nativeCanopyOcclusionSphere(geometry,record,matrix),pos=geometry.getAttribute('position');
 for(let i=0;i<pos.count;i++)for(const phase of [-1,1]){
  const v=new T.Vector3().fromBufferAttribute(pos,i);v.x+=phase*.027*Math.pow(Math.max(v.y/12.5,0),2)*12.5;v.applyMatrix4(matrix);assert.ok(sphere.containsPoint(v));
 }
 geometry.dispose();
});
test('separate solid wall cores never close a window between their actual triangles',()=>{
 const {camera,wall,occlusion}=fixture();
 wall.geometry.setAttribute('position',new T.Float32BufferAttribute([-30,-10,-20,-5,-10,-20,-5,20,-20,5,-10,-20,30,-10,-20,5,20,-20],3));
 occlusion.prepare(camera);
 assert.equal(occlusion.rejects(new T.Sphere(new T.Vector3(0,0,-80),2)),false,'plant visible through empty opening');
 assert.equal(occlusion.rejects(new T.Sphere(new T.Vector3(50,0,-80),2)),true,'plant fully behind right solid triangle');
});
test('screen bins preserve the complete triangle proof for sphere centres within the main viewport',()=>{
 const {occlusion}=fixture(),cone=triangleOcclusionCone(...points,new T.Vector3());
 for(let i=0;i<400;i++){
  const sphere=new T.Sphere(new T.Vector3(Math.sin(i*1.7)*40,Math.cos(i*2.1)*40,-80),1+i%12);
  assert.equal(occlusion.rejects(sphere),sphereBehindTriangle(sphere,cone));
 }
 assert.ok(occlusion.stats().planeTests<400*5);
});
test('native instances restore immediately on toggle/portal/occluder removal, including movement below old 4m threshold',async()=>{
 const {root,camera,wall}=fixture(),n=8,normal=new Uint8Array(n*n*4),splat=new Uint8Array(n*n*4);
 const records=Object.fromEntries(['palms','trees','bananas','shrubs','youngPalms','ferns','monsteras','elephantEars','heliconias','strelitzias'].map(name=>[name,[]]));records.trees=[{x:0,y:0,z:-80,s:1,sy:1,yaw:0,seed:.1,H:12.5}];
 const source={domain:{res:n,size:8,origin:-4},coarse:{res:n,heights:new Float32Array(n*n),normal,splat},grassMask:{res:n,data:normal},shore:{res:n,data:new Float32Array(n*n*4)},records,appearance:{swellDir:{x:0,y:-1}},ocean:{level:0,fft:{local:{windDirection:25}},shore:{period:9,amplitude:.34}},tiles:[],readTile:async()=>({})};
 const texture=new T.Texture(),bark={map:texture,normalMap:texture,orm:texture};
 // RepositoryWorldHost builds using an isolated clone; only the renderer's real
 // camera is admitted through repositorySceneOptions, just as main.js does.
 const sceneOptions=repositorySceneOptions({nativeIsland:{}},{nativeIslandRead:async()=>{}},{backend:'webgl2',camera});
 assert.equal(sceneOptions.nativeIsland.mainCamera,camera);
 const native=await buildWebGLNativeIsland({project:{environment:{}},root,camera:camera.clone(),options:{...sceneOptions.nativeIsland,readNativeIsland:async()=>source,prepareVegetationAssets:async()=>({palm:bark,tree:bark,dispose(){texture.dispose();}})}});
 try{
  native.bindView(camera);assert.equal(native.stats().plants.displayed,1);assert.equal(native.stats().plants.occlusion.retainedBytes,0,'unrelated worlds retain no pose cache');
  native.setPlantOccluders([wall]);native.bindView(camera);assert.equal(native.stats().plants.displayed,0);assert.equal(native.stats().plants.occlusion.rejected,1);
  assert.ok(native.stats().plants.occlusion.proofTriangles>0,'the actual main camera, not the preparation clone, receives proof');
  assert.equal(native.stats().plants.occlusion.retainedBytes,96,'Float32 pose and Float64 bounds shared by near/far');
  camera.position.x=.01;camera.updateMatrixWorld();native.bindView(camera);assert.equal(native.stats().plants.occlusion.rejected,1);
  native.setPlantOcclusionEnabled(false);native.bindView(camera);assert.equal(native.stats().plants.displayed,1);
  native.setPlantOcclusionEnabled(true);native.bindView(camera);assert.equal(native.stats().plants.displayed,0);
  const portal=camera.clone();native.bindView(portal);assert.equal(native.stats().plants.displayed,1);native.bindView(camera);assert.equal(native.stats().plants.displayed,0);
  let plant;root.traverse(n=>{if(n.userData.nativePlantSpecies==='trees'&&n.userData.nativePlantDistant&&n.count)plant=n;});
  native.bindView(portal);root.traverse(n=>{if(n.userData.nativePlantSpecies==='trees'&&n.userData.nativePlantDistant&&n.count)plant=n;});
  const alternateVersion=plant.instanceMatrix.version;portal.position.x+=.01;native.bindView(portal);assert.equal(plant.instanceMatrix.version,alternateVersion,'alternate views keep the normal movement threshold');
  wall.material.transparent=true;native.bindView(camera);const ineligibleVersion=plant.instanceMatrix.version;camera.position.x+=.01;native.bindView(camera);assert.equal(plant.instanceMatrix.version,ineligibleVersion,'ineligible materials do not force exact repacking');wall.material.transparent=false;native.bindView(camera);
  const foreignScene=new T.Scene();foreignScene.add(wall);native.bindView(camera);assert.equal(native.stats().plants.displayed,1);root.add(wall);native.bindView(camera);assert.equal(native.stats().plants.displayed,0);wall.removeFromParent();native.bindView(camera);assert.equal(native.stats().plants.displayed,1);
 }finally{native.dispose();}
});
