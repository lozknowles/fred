import {canonicalWaterSurfaceExclusions,waterSurfaceExclusionTest} from '../ocean/WaterSurfaceExclusions.js';
import {T} from './vendor/world-engine-contract.js';
import {registerRendererMediaSky} from './MediaScreen.js';
import {NativeIslandTerrain} from './NativeIslandTerrain.js';
import {NativeIslandTiles} from './NativeIslandTiles.js';
import {getDetailTexture} from '../world/terrain/DetailTextures.js';
import * as Plants from '../world/vegetation/PlantGeometry.js';
import {createNativePlantOcclusion,nativeCanopyOcclusionSphere} from './NativePlantOcclusion.js';
import {loadNativeLeafAtlas,NATIVE_VEGETATION_SURFACE_GLSL,NATIVE_CANOPY_COLOR_GLSL} from './NativeVegetation.js';
import {createNativeUnderstoryIndex} from './NativeUnderstoryIndex.js';

export const WEBGL_NATIVE_ISLAND_QUALIFICATION=Object.freeze({backend:'webgl2',backendQualification:'unqualified-optical-equivalence',waterModel:'source-parameter analytic swell with broken-up shore foam and detail normals',limitations:['Original FFT, refraction, swash simulation and underwater optics are not reproduced.','Near plants use original source geometry and exact records; distant crowns use reduced source card geometry, not the original octahedral atlases.','Leaf alpha, wind and terrain microshading are GLSL approximations; grass density is applied to the ground without individual grass blades.']});
const fract=x=>x-Math.floor(x),UP=new T.Vector3(0,1,0);
export function nativePlantPoseMatrix(record,out=new T.Matrix4(),canopy=false){return out.compose(new T.Vector3(record.x,record.y,record.z),new T.Quaternion().setFromAxisAngle(UP,record.yaw),new T.Vector3(record.s,record.s*(canopy?Math.abs(record.sy??1):1),record.s));}
/** Copies the ORIGINAL installed geometry including source part/deformation attributes. */
export function convertNativePlantGeometry(source,{leafStride=1}={}){
 const geometry=new T.BufferGeometry();
 for(const name of ['position','normal','uv','aVeg','aMat']){const attr=source.getAttribute(name);if(!attr)continue;const array=new Float32Array(attr.count*attr.itemSize);for(let i=0;i<attr.count;i++)for(let c=0;c<attr.itemSize;c++)array[i*attr.itemSize+c]=attr.getComponent(i,c);geometry.setAttribute(name,new T.BufferAttribute(array,attr.itemSize));}
 const indices=[],part=geometry.getAttribute('aMat');let card=0;
 for(let i=0;i<source.index.count;i+=3){const a=source.index.getX(i),leaf=part.getX(a)===1||part.getX(a)===4;if(leaf&&leafStride>1&&Math.floor(card++/2)%leafStride!==0)continue;indices.push(a,source.index.getX(i+1),source.index.getX(i+2));}
 geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}
// Matches Three's (C-B) x (A-B), Float32 write after every face addition,
// and final reciprocal-length multiplication. The regular grid fixes face order.
function terrainGridNormals(geometry, nx, nz, east = false, south = false) {
 const positions = geometry.attributes.position.array;
 let attribute = geometry.attributes.normal;
 if (!attribute) {
  attribute = new T.BufferAttribute(new Float32Array(positions.length), 3);
  geometry.setAttribute('normal', attribute);
 }
 const normals = attribute.array;
 const face = (a, b, c, target = -1) => {
  const ai = a * 3, bi = b * 3, ci = c * 3;
  const cbx = positions[ci] - positions[bi];
  const cby = positions[ci + 1] - positions[bi + 1];
  const cbz = positions[ci + 2] - positions[bi + 2];
  const abx = positions[ai] - positions[bi];
  const aby = positions[ai + 1] - positions[bi + 1];
  const abz = positions[ai + 2] - positions[bi + 2];
  const x = cby * abz - cbz * aby;
  const y = cbz * abx - cbx * abz;
  const z = cbx * aby - cby * abx;
  if (target >= 0) {
   const offset = target * 3;
   normals[offset] += x;
   normals[offset + 1] += y;
   normals[offset + 2] += z;
  } else {
   normals[ai] += x;
   normals[ai + 1] += y;
   normals[ai + 2] += z;
   normals[bi] += x;
   normals[bi + 1] += y;
   normals[bi + 2] += z;
   normals[ci] += x;
   normals[ci + 1] += y;
   normals[ci + 2] += z;
  }
 };
 const normalize = vertex => {
  const offset = vertex * 3;
  const x = normals[offset], y = normals[offset + 1], z = normals[offset + 2];
  const reciprocalLength = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
  normals[offset] = x * reciprocalLength;
  normals[offset + 1] = y * reciprocalLength;
  normals[offset + 2] = z * reciprocalLength;
 };
 if (!east && !south) {
  normals.fill(0);
  for (let z = 0; z < nz - 1; z++) {
   for (let x = 0; x < nx - 1; x++) {
    const vertex = z * nx + x;
    face(vertex, vertex + nx, vertex + 1);
    face(vertex + 1, vertex + nx, vertex + nx + 1);
   }
  }
  for (let vertex = 0; vertex < nx * nz; vertex++) normalize(vertex);
 } else {
  // Only vertices sharing a face with a changed east/south boundary can differ.
  // Rebuild each from all adjacent faces in the original global face order.
  for (let z = 0; z < nz; z++) {
   const firstX = south && z >= nz - 2 ? 0 : east ? Math.max(0, nx - 2) : nx;
   for (let x = firstX; x < nx; x++) {
    const vertex = z * nx + x, offset = vertex * 3;
    normals[offset] = normals[offset + 1] = normals[offset + 2] = 0;
    for (let cellZ = Math.max(0, z - 1); cellZ <= Math.min(nz - 2, z); cellZ++) {
     for (let cellX = Math.max(0, x - 1); cellX <= Math.min(nx - 2, x); cellX++) {
      const a = cellZ * nx + cellX, b = a + nx, c = a + 1, d = b + 1;
      if (vertex === a || vertex === b || vertex === c) face(a, b, c, vertex);
      if (vertex === c || vertex === b || vertex === d) face(c, b, d, vertex);
     }
    }
    normalize(vertex);
   }
  }
 }
 attribute.needsUpdate = true;
}
export function webGLNativeTerrainTile(data,tile,step=1){
 const nx=Math.ceil(tile.width/step)+1,nz=Math.ceil(tile.height/step)+1,positions=new Float32Array(nx*nz*3),uv=new Float32Array(nx*nz*2),indices=new (nx*nz-1>=65535?Uint32Array:Uint16Array)((nx-1)*(nz-1)*6);
 let cursor=0;
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const gx=Math.min(data.res-1,tile.x+Math.min(tile.width,x*step)),gz=Math.min(data.res-1,tile.z+Math.min(tile.height,z*step)),i=z*nx+x;positions[i*3]=data.origin+(gx+.5)*data.texel;positions[i*3+1]=data.heights[gz*data.res+gx];positions[i*3+2]=data.origin+(gz+.5)*data.texel;uv[i*2]=x/(nx-1);uv[i*2+1]=z/(nz-1);if(x<nx-1&&z<nz-1){indices[cursor++]=i;indices[cursor++]=i+nx;indices[cursor++]=i+1;indices[cursor++]=i+1;indices[cursor++]=i+nx;indices[cursor++]=i+nx+1;}}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setIndex(new T.BufferAttribute(indices,1));terrainGridNormals(geometry,nx,nz);return geometry;
}
/** Fine tiles own their interior, and borrow only the inclusive east/south seam.
 * A newly applied tile can therefore change resident west/north/northwest seams.
 * Keep geometry and attributes resident; normal summation stays exactly Three's.
 */
export function updateWebGLNativeTerrainSeam(data,tile,geometry,incoming){
 if(tile.id===incoming.id||tile.x>incoming.x+incoming.width-1||tile.z>incoming.z+incoming.height-1||tile.x+tile.width<incoming.x||tile.z+tile.height<incoming.z)return false;
 const nx=tile.width+1,nz=tile.height+1,position=geometry.attributes.position,p=position.array;let changed=false,east=false,south=false;
 const update=(x,z)=>{const gx=Math.min(data.res-1,tile.x+x),gz=Math.min(data.res-1,tile.z+z);if(gx<incoming.x||gx>=incoming.x+incoming.width||gz<incoming.z||gz>=incoming.z+incoming.height)return;const i=(z*nx+x)*3+1,h=data.heights[gz*data.res+gx];if(p[i]!==h){p[i]=h;changed=true;east ||= x===nx-1;south ||= z===nz-1;}};
 for(let z=0;z<nz-1;z++)update(nx-1,z);
 for(let x=0;x<nx;x++)update(x,nz-1);
 if(!changed)return false;
 position.needsUpdate=true;terrainGridNormals(geometry,nx,nz,east,south);
 if(geometry.boundingBox!==null)geometry.computeBoundingBox();
 if(geometry.boundingSphere!==null)geometry.computeBoundingSphere();
 return true;
}
function texture(data,res,channels=4,type=T.UnsignedByteType){const value=new T.DataTexture(data,res,res,channels===4?T.RGBAFormat:T.RedFormat,type);value.magFilter=value.minFilter=type===T.FloatType?T.NearestFilter:T.LinearFilter;value.generateMipmaps=false;value.flipY=false;value.needsUpdate=true;return value;}
async function barkTextures(source){
 const owned=[],result={palm:{},tree:{}};
 try{const settled=await Promise.allSettled(['palm','tree'].flatMap(kind=>[['albedo','map'],['normal','normalMap'],['orm','orm']].map(async([slot,name])=>{const id=source.vegetationTextures?.[kind]?.[slot],ref=source.barkAssets?.find(r=>r.id===id);if(!ref||ref.mediaType!=='image/jpeg')throw Error('Missing portable WebGL bark resource.');const bytes=await source.readAsset(id),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));if(bitmap.width!==ref.width||bitmap.height!==ref.height){bitmap.close();throw Error('WebGL bark dimensions differ.');}const value=new T.Texture(bitmap);value.wrapS=value.wrapT=T.RepeatWrapping;value.colorSpace=slot==='albedo'?T.SRGBColorSpace:T.NoColorSpace;value.needsUpdate=true;value.addEventListener('dispose',()=>bitmap.close());owned.push(value);result[kind][name]=value;})));const failure=settled.find(r=>r.status==='rejected');if(failure)throw failure.reason;return{...result,dispose(){for(const value of owned)value.dispose();}};}catch(error){for(const value of owned)value.dispose();throw error;}
}
const PLANT_VERTEX=`
attribute vec4 aVeg;attribute vec4 aMat;attribute vec4 iPlant;attribute vec4 iRecord;
uniform float nativeTime;uniform vec2 nativeWind;uniform vec2 nativeGust;uniform float nativeWindStrength;uniform sampler2D nativeDetail;
varying vec4 vNativePart;varying vec2 vNativeUv;
vec3 nativeRotate(vec3 v,vec3 axis){vec3 k=vec3(axis.z,0.0,-axis.x);vec3 c=cross(k,v);return v+c+cross(k,c)/(axis.y+1.0);}
vec3 nativePlantPosition(vec3 P){
 float u=aVeg.x,H=iPlant.z,seed=iPlant.w;vec3 leanDir=vec3(cos(iPlant.x),0.0,sin(iPlant.x));
 vec2 base=instanceMatrix[3].xz;vec2 gp=base-nativeGust;float g=smoothstep(.46,.6,texture2D(nativeDetail,gp/140.0).a*.62+texture2D(nativeDetail,gp/61.0+.37).a*.38);
 float w=nativeWindStrength,phase=seed*6.2832;vec2 wd=vec2(cos(iRecord.x)*nativeWind.x-sin(iRecord.x)*nativeWind.y,sin(iRecord.x)*nativeWind.x+cos(iRecord.x)*nativeWind.y);
 float sway=w*w*.014*(g*.9+.3)+sin(nativeTime*.83+phase)*w*.0065*(g+.45);float side=sin(nativeTime*.61+phase*1.7)*w*.0028;vec3 wind=vec3(wd.x,0.0,wd.y)*sway+vec3(-wd.y,0.0,wd.x)*side;
 if(iRecord.z>.5){P.xz+=vec2(wind.x,wind.z)*pow(max(P.y/12.5,0.0),2.0)*12.5;return P;}
 float c=fract(seed*7.31),fc=mix(u,u*(2.0-u),c),df=mix(1.0,2.0*(1.0-u),c);vec3 tangent=normalize(vec3(0,1,0)+leanDir*(iPlant.y*df)+wind*(u*2.0));
 vec3 stem=vec3(0,u*H,0)+(leanDir*(iPlant.y*fc)+wind*u*u)*H+nativeRotate(vec3(P.x,0,P.z),tangent);
 vec3 tip=normalize(vec3(0,1,0)+leanDir*(iPlant.y*(1.0-c))+wind*2.0),tilt=normalize(vec3(0,1,0)+tip);vec3 centre=vec3(0,H,0)+(leanDir*iPlant.y+wind)*H;vec3 crown=nativeRotate(P,tilt);
 float s=aVeg.y,ph=aVeg.w;float bend=s*s*4.5*(w*w*.16*(g*.8+.35)+sin(nativeTime*(ph*.5+1.3)+ph*23.0+phase)*w*.075*(g+.3));
 vec3 disp=vec3(wd.x,0,wd.y)*bend+vec3(0,sin(nativeTime*(ph+2.1)+ph*41.0)*s*s*w*.1-bend*.3,0);vec3 moved=normalize(crown+disp+vec3(0,.00001,0))*length(crown);return aMat.x<.5?stem:centre+moved;
}`;
function plantMaterial(kind,time,wind,gust,detail,bark,leafAtlas){
 const material=new T.MeshStandardMaterial({color:'#ffffff',side:T.DoubleSide,roughness:.86});material.alphaTest=.35;material.userData.nativeWindStrength=1;material.userData.nativeWindVector=wind.value;
 material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{nativeTime:time,nativeWind:wind,nativeGust:gust,nativeWindStrength:{value:1},nativeDetail:{value:detail},nativeBark:{value:bark.map},nativeBarkNormal:{value:bark.normalMap},nativeOrm:{value:bark.orm},nativeLeafAtlas:{value:leafAtlas}});
 shader.vertexShader=PLANT_VERTEX+'\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vNativeSeed;varying float vNativeHeight;').replace('#include <begin_vertex>',`#include <begin_vertex>
 vNativePart=aMat;vNativeUv=uv;transformed=nativePlantPosition(transformed);vNativeSeed=iPlant.w;vNativeHeight=transformed.y*iRecord.y;`);
 shader.fragmentShader=NATIVE_VEGETATION_SURFACE_GLSL+`uniform sampler2D nativeBark;uniform sampler2D nativeBarkNormal;uniform sampler2D nativeOrm;
`+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 bool bark=vNativePart.x<.5${kind==='tree'?' || vNativePart.x>4.5':''};
 if(bark){diffuseColor.rgb*=texture2D(nativeBark,vNativeUv).rgb*texture2D(nativeOrm,vNativeUv).r;}else{
 ${kind==='tree'?NATIVE_CANOPY_COLOR_GLSL:'if(!vegPlantMask())discard;diffuseColor.rgb*=vegPlantAlbedo();'}
 }`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\n if(vNativePart.x<.5${kind==='tree'?' || vNativePart.x>4.5':''})roughnessFactor=clamp(texture2D(nativeOrm,vNativeUv).g,.6,1.0);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n if(vNativePart.x<.5${kind==='tree'?' || vNativePart.x>4.5':''}){vec3 barkN=texture2D(nativeBarkNormal,vNativeUv).xyz*2.0-1.0;vec3 p1=dFdx(-vViewPosition),p2=dFdy(-vViewPosition);vec2 t1=dFdx(vNativeUv),t2=dFdy(vNativeUv);vec3 tangent=normalize(p1*t2.y-p2*t1.y),bitangent=normalize(-p1*t2.x+p2*t1.x);normal=normalize(tangent*barkN.x*.65+bitangent*barkN.y*.65+normal*barkN.z);}`);
 };material.customProgramCacheKey=()=> 'native-source-plants-webgl/2:'+kind;return material;
}
function buildPlants(source,time,detail,materials,mainCamera){
 const occlusion=createNativePlantOcclusion(mainCamera),occlusionSphere=new T.Sphere();
 const root=new T.Group(),batches=[],matrix=new T.Matrix4();let displayed=0,lastPos=new T.Vector3(Infinity,Infinity,Infinity),lastDirection=new T.Vector3(),lastCamera=null;
 const specs={palms:[Plants.buildPalmNear,120,2800,false],youngPalms:[Plants.buildYoungPalm,0,140,false],ferns:[Plants.buildFern,0,58,false],bananas:[Plants.buildBanana,0,120,false],monsteras:[Plants.buildMonstera,0,105,false],elephantEars:[Plants.buildElephantEar,0,105,false],heliconias:[Plants.buildHeliconia,0,105,false],strelitzias:[Plants.buildStrelitzia,0,105,false],trees:[Plants.buildTreeNear,65,2800,true],shrubs:[Plants.buildShrubNear,45,2800,true]};
 for(const [species,[factory,near,far,canopy]] of Object.entries(specs)){
  const variants=canopy?(species==='trees'?3:2):species==='bananas'?2:1;
  for(let variant=0;variant<variants;variant++){
   const records=source.records[species].filter(r=>canopy?Math.floor(fract(r.seed*7.77)*variants)===variant:species==='bananas'?(r.seed<.5?0:1)===variant:true);if(!records.length)continue;
   const occlusionCache={poses:null,bounds:null},understoryIndex=!canopy&&far<=140?createNativeUnderstoryIndex(records,far):null;
   const original=species==='bananas'?factory(variant?23:9):factory();const native=canopy?Plants.lobeVariantGeometry(original.geometry,Plants.LOBE_TABLE,(variant+(species==='shrubs'?Plants.TREE_VARIANTS:0))*8):original.geometry;
   for(const distant of near?[false,true]:[false]){
    const farPalm=species==='palms'&&distant?Plants.buildPalmFar().geometry:null;const geometry=convertNativePlantGeometry(farPalm??native,{leafStride:distant?(canopy?8:1):1}),count=records.length;if(farPalm)farPalm.dispose();geometry.setAttribute('iPlant',new T.InstancedBufferAttribute(new Float32Array(count*4),4));geometry.setAttribute('iRecord',new T.InstancedBufferAttribute(new Float32Array(count*4),4));

    const mesh=new T.InstancedMesh(geometry,materials[canopy?'tree':'palm'],count);mesh.count=0;mesh.frustumCulled=false;mesh.userData.mediaOcclusionPlant=canopy?'native-canopy-v1':'native-palm-v1';mesh.userData.nativePlantSpecies=species;mesh.userData.nativePlantDistant=distant;root.add(mesh);batches.push({mesh,records,occlusionCache,understoryIndex,species,canopy,distant,near,far});
   }
   if(native!==original.geometry)native.dispose();original.geometry.dispose();
  }
 }
 let lastProof=null,lastCanopyProof=false,lastHadProof=false;const lastVP=new T.Matrix4(),lastProjection=new T.Matrix4(),lastRoot=new T.Matrix4(),identity=new T.Matrix4();
 const direction=new T.Vector3(),frustum=new T.Frustum(),vp=new T.Matrix4(),sphere=new T.Sphere();
 return{root,setOccluders(value){occlusion.setOccluders(value);lastCamera=null;},setOcclusionEnabled(value){occlusion.setEnabled(value);lastCamera=null;},updateView(camera,exactView=false){
  camera.getWorldDirection(direction);camera.updateMatrixWorld();vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  occlusion.prepare(camera,root);root.updateWorldMatrix(true,false);
  const canopyProof=materials.tree.userData.nativeWindStrength===1&&Math.abs(materials.tree.userData.nativeWindVector.length()-1)<1e-6,proofActive=occlusion.active&&canopyProof;
  if(lastCamera===camera&&lastCanopyProof===canopyProof&&lastRoot.equals(root.matrixWorld)){
   if(proofActive&&lastHadProof&&lastVP.equals(vp)&&lastProof===occlusion.signature)return;
   // Portal crops can change the frustum while reusing the same camera. An
   // alternate view may reuse only its complete unchanged view-projection.
   // Main views keep their normal movement tolerance when projection is fixed.
   const alternate=mainCamera&&camera!==mainCamera;
   if(!proofActive&&!lastHadProof&&(alternate||exactView?lastVP.equals(vp):lastProjection.equals(camera.projectionMatrix)&&lastPos.distanceToSquared(camera.position)<16&&lastDirection.dot(direction)>.998))return;
  }
  lastCamera=camera;lastPos.copy(camera.position);lastDirection.copy(direction);lastVP.copy(vp);lastProjection.copy(camera.projectionMatrix);lastRoot.copy(root.matrixWorld);lastProof=occlusion.signature;lastCanopyProof=canopyProof;lastHadProof=proofActive;
  frustum.setFromProjectionMatrix(vp);occlusion.resetCounters();displayed=0;
  const identityRoot=root.matrixWorld.equals(identity);
  for(const batch of batches){
   const {mesh,occlusionCache}=batch,plant=mesh.geometry.getAttribute('iPlant'),recordAttr=mesh.geometry.getAttribute('iRecord');let count=0;
   if(batch.canopy&&proofActive&&!occlusionCache.poses){
    const n=batch.records.length;occlusionCache.poses=new Float32Array(n*16);occlusionCache.bounds=new Float64Array(n*4);
    for(let i=0;i<n;i++){nativePlantPoseMatrix(batch.records[i],matrix,true);matrix.toArray(occlusionCache.poses,i*16);nativeCanopyOcclusionSphere(mesh.geometry,batch.records[i],matrix,occlusionSphere);occlusionCache.bounds.set([occlusionSphere.center.x,occlusionSphere.center.y,occlusionSphere.center.z,occlusionSphere.radius],i*4);}
   }
   const poses=occlusionCache.poses,canopyBounds=occlusionCache.bounds,candidates=batch.understoryIndex?.query(camera.position.x,camera.position.z);
   for(let candidate=0,n=candidates?.length??batch.records.length;candidate<n;candidate++){
    const i=candidates?candidates[candidate]:candidate;
    const r=batch.records[i],distance=Math.hypot(r.x-camera.position.x,r.z-camera.position.z);
    if(distance>batch.far||batch.near&&(batch.distant?distance<batch.near:distance>=batch.near))continue;
    sphere.center.set(r.x,r.y+(r.H??5)*.5,r.z);sphere.radius=Math.max(4,r.H??0)*r.s+4;if(!frustum.intersectsSphere(sphere))continue;
    if(batch.canopy&&proofActive){
     const j=i*4;
     if(identityRoot){if(occlusion.rejectsXYZ(canopyBounds[j],canopyBounds[j+1],canopyBounds[j+2],canopyBounds[j+3]))continue;}
     else{occlusionSphere.center.fromArray(canopyBounds,j);occlusionSphere.radius=canopyBounds[j+3];occlusionSphere.applyMatrix4(root.matrixWorld);if(occlusion.rejects(occlusionSphere))continue;}
    }
    // Only canopy instances in a world with admitted proof retain cached poses.
    // Near/far share the Float32 upload pose; proof bounds use original doubles.
    if(poses)matrix.fromArray(poses,i*16);else nativePlantPoseMatrix(r,matrix,batch.canopy);mesh.setMatrixAt(count,matrix);plant.setXYZW(count,(r.la??0)-r.yaw,r.l??0,(batch.species==='bananas'?.02:r.H??1)/Math.max(.001,r.s),r.seed);recordAttr.setXYZW(count,r.yaw,r.s,batch.canopy?1:0,0);count++;
   }
   mesh.count=count;mesh.instanceMatrix.needsUpdate=true;plant.needsUpdate=recordAttr.needsUpdate=true;displayed+=count;
  }

 },stats:()=>({records:Object.values(source.records).filter(Array.isArray).reduce((n,a)=>n+a.length,0),displayed,batches:batches.length,occlusion:{...occlusion.stats(),retainedBytes:[...new Set(batches.map(b=>b.occlusionCache))].reduce((n,c)=>n+(c.poses?.byteLength??0)+(c.bounds?.byteLength??0),0)},farPolicy:'every eighth distant leaf card; unqualified atlas equivalence'}),dispose(){for(const batch of batches)batch.mesh.geometry.dispose();root.removeFromParent();}};
}
export function terrainMaterial({normal,splat,rect,domain,detail,shore,grass,ready,coarse,time,windDirection=0}){
 const material=new T.MeshStandardMaterial({color:'#ffffff',roughness:.9,side:T.DoubleSide});
 material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{nativeNormal:{value:normal},nativeSplat:{value:splat},nativeRect:{value:new T.Vector4(...rect)},nativeDomain:{value:new T.Vector2(domain.origin,domain.size)},nativeDetail:{value:detail},nativeShore:{value:shore},nativeGrass:{value:grass},nativeReady:{value:ready},nativeTime:time});
 shader.uniforms.nativeTerrainWind={value:new T.Vector2(Math.sin(windDirection),Math.cos(windDirection))};
 shader.vertexShader=`varying vec3 vNativeWorld;
`+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vNativeWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
 shader.fragmentShader=`varying vec3 vNativeWorld;uniform sampler2D nativeNormal,nativeSplat,nativeDetail,nativeShore,nativeGrass,nativeReady;uniform vec4 nativeRect;uniform vec2 nativeDomain,nativeTerrainWind;uniform float nativeTime;
 // TerrainShading.js surface-gradient bump; bounded at grazing/degenerate facets.
 vec3 nativeTerrainBump(vec3 P,vec3 N,float hd){
  vec3 dx=dFdx(P),dy=dFdy(P),r1=cross(dy,N),r2=cross(N,dx);
  float det=dot(dx,r1),ad=abs(det),area=length(cross(dx,dy));
  vec3 grad=(r1*dFdx(hd)+r2*dFdy(hd))*sign(det);
  float frame=area/max(length(dx)*length(dy),1e-20),facet=ad/max(area,1e-20);
  grad*=min(1.0,ad*1.4/max(length(grad),1e-20))*smoothstep(.12,.35,frame)*smoothstep(.3,.6,facet);
  // Divide before normalization to avoid a near-zero vector on collapsed facets.
  return normalize(N-grad/max(ad,1e-20));
 }
`+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 domainUv=(vNativeWorld.xz-nativeDomain.x)/nativeDomain.y;
 ${coarse?'if(texture2D(nativeReady,domainUv).r>.5)discard;':''}
 vec2 mapUv=(vNativeWorld.xz-nativeRect.xy)/nativeRect.zw;vec4 masks=texture2D(nativeSplat,mapUv),nr=texture2D(nativeNormal,mapUv);float h=vNativeWorld.y;
 vec4 a=texture2D(nativeDetail,vNativeWorld.xz/1.9),b=texture2D(nativeDetail,mat2(.2675,.9636,-.9636,.2675)*vNativeWorld.xz/6.7+.21),macro=texture2D(nativeDetail,vNativeWorld.xz/34.0+.13);
 vec4 fine=texture2D(nativeDetail,mat2(-.7374,.6755,-.6755,-.7374)*vNativeWorld.xz/.63+.53);
 // Captured normal RG = normal XZ, B = rockiness, A = baked AO.
 vec2 nxz=nr.rg*2.0-1.0;vec3 terrainN=normalize(vec3(nxz.x,sqrt(max(1.0-dot(nxz,nxz),.0025)),nxz.y));
 float slope=1.0-terrainN.y;
 float rock=smoothstep(.2,.65,nr.b+(a.r-.5)*.3+slope*.38);float sand=smoothstep(.3,.72,masks.r+(b.b-.5)*.5+(macro.a-.5)*.35)*(1.0-rock);float path=smoothstep(.2,.7,masks.g)*(1.0-rock);
 vec3 soil=mix(vec3(.10,.15,.035),vec3(.21,.26,.07),b.g);soil=mix(soil,vec3(.19,.12,.065),path);
 float grain=(min(a.b,.62)-.45)*.30+(min(fine.b,.62)-.45)*.20+(macro.a-.5)*.16;
 // Source Terrain.js: fixed 10.5 cm wind-ripple wavelength, smoothly warped;
 // filter by phase footprint instead of varying wavelength in world space.
 float phase=dot(vNativeWorld.xz,nativeTerrainWind)*(6.2832/.105)+b.a*24.0+a.a*7.0+macro.a*30.0;
 float rip=pow(sin(phase)*.5+.5,1.6);
 float trod=smoothstep(.52,.7,a.g+(b.g-.5)*.6)*smoothstep(.8,3.0,h);
 float windK=(1.0-smoothstep(.6,2.2,fwidth(phase)))*smoothstep(1.5,2.2,h)*(1.0-path)*(1.0-trod*.7)*smoothstep(.2,.5,macro.a+b.a*.3);
 float ripple=(rip-.5)*.12*windK;
 // Pale coral sand source palette, converted from source sRGB to linear.
 vec3 beach=mix(vec3(.656,.523,.319),vec3(.787,.674,.477),smoothstep(.3,.72,macro.a+smoothstep(.8,3.0,h)*.2));
 vec3 ground=mix(soil,beach*(1.0+grain+ripple)*(1.0-trod*.07)*(1.0-path*.07),sand);
 // Source TerrainShading.js: plates on cliff faces, height-warped strata and
 // dry upper-face lichen. One triplanar level reuses the existing detail map.
 vec3 w=pow(abs(terrainN),vec3(4.0));w/=max(dot(w,vec3(1.0)),1e-5);
 vec4 plates=texture2D(nativeDetail,vNativeWorld.zy/6.1)*w.x+texture2D(nativeDetail,vNativeWorld.xz/6.1+.37)*w.y+texture2D(nativeDetail,vNativeWorld.xy/6.1+.71)*w.z;
 float steep=1.0-smoothstep(.55,.85,terrainN.y),bandY=h+plates.a*2.5+macro.a*6.0;
 float strata=texture2D(nativeDetail,vec2(bandY/14.0,.13)).a;
 float strataAA=1.0-smoothstep(.15,.6,fwidth(bandY));
 float tone=plates.r*.65+a.r*.35+(macro.a-.5)*.7+(strata-.5)*.8*steep*strataAA;
 vec3 stone=mix(vec3(.0196,.0185,.0164),vec3(.0732,.0660,.0571),smoothstep(.1,.5,tone));
 stone=mix(stone,vec3(.1960,.1746,.1473),smoothstep(.5,.85,tone));
 stone*=smoothstep(.05,.25,plates.r)*.15+.85;
 float dryRock=smoothstep(2.6,4.0,h);
 float lichen=smoothstep(.6,.78,plates.g)*smoothstep(.2,.7,terrainN.y)*dryRock*smoothstep(.45,.65,macro.a);
 stone=mix(stone,vec3(.4480,.4480,.3672),lichen*.45);
 stone=mix(stone,vec3(.5705,.2140,.0331),smoothstep(.8,.88,plates.g)*dryRock*smoothstep(.5,.8,terrainN.y)*.3);
 float rockWet=1.0-smoothstep(.25,1.0,h+plates.a*.3);stone*=mix(1.0,.55,rockWet);
 ground=mix(ground,stone,rock);
 ground=mix(ground,vec3(.29,.34,.21),1.0-smoothstep(-8.0,-.2,h));
 vec4 grassCover=texture2D(nativeGrass,domainUv);ground=mix(ground,ground*vec3(.72,.96,.57)*(macro.g*.24+.88),clamp(grassCover.r,0.0,1.0)*.36*(1.0-sand)*(1.0-rock));
 // Original static fallback damp band; this is not live swash/history wetness.
 float land=smoothstep(-.6,.12,h),wet=(1.0-smoothstep(.05,.65,h))*land;
 float dampMottle=smoothstep(.3,.7,b.a+(a.g-.45)*.6+(macro.a-.5)*.4);
 float damp=(1.0-smoothstep(.5,1.7,h+b.a*.3))*mix(.22,.5,dampMottle);
 float wetK=max(wet,damp)*sand*land;
 diffuseColor.rgb*=ground*mix(1.0,.53,wetK)*mix(.55,1.0,nr.a);
 float terrainRough=mix(mix(.88,.93,sand),mix(mix(.88,.8,steep),.45,rockWet),rock);
 terrainRough=mix(terrainRough,mix(.42,.16,wet),wetK);
 terrainRough=mix(terrainRough,.75,1.0-land);
 float px=max(length(dFdx(vNativeWorld)),length(dFdy(vNativeWorld)));
 float fineK=1.0-smoothstep(.006,.02,px),midK=1.0-smoothstep(.03,.1,px);
 float sandH=(min(a.b,.62)*.004+min(fine.b,.62)*.003+rip*.005*windK)*(1.0-wet*.6);
 float groundH=mix(a.g*.035+b.g*.045+fine.g*.012,a.b*.012+a.g*.01,path);
 float rockH=plates.r*.07*(midK*.6+.4)+a.r*.012*fineK*(1.0-rockWet*.6);
 float terrainHeight=mix(mix(groundH,sandH,sand),rockH,rock);
 `);
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\n roughnessFactor=clamp(terrainRough,.16,1.0);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n normal=normalize(mat3(viewMatrix)*nativeTerrainBump(vNativeWorld,terrainN,terrainHeight));`);
 };material.customProgramCacheKey=()=> 'native-field-terrain-webgl/2:'+coarse;return material;
}
/** A ball strictly inside every actual triangular sky facet is a convex subset
 * of this renderer-created closed sphere. Certify planes once, then compare the
 * private position/index byte snapshots on each proof: version flags alone do
 * not detect raw typed-array writes. Those bounded comparisons are intentional.
 */
function nativeSkyInteriorCertificate(mesh,material,vertexShader,fragmentShader,uniforms){
 const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,counts={geometryInspections:1,facetPlaneEvaluations:0,containmentChecks:0,byteComparisonChecks:0,uploadNotifications:0,compileNotifications:0};
 const attribute=a=>({attribute:a,constructor:a.constructor,array:a.array,buffer:a.array.buffer,byteOffset:a.array.byteOffset,byteLength:a.array.byteLength,itemSize:a.itemSize,count:a.count,normalized:a.normalized,version:a.version,usage:a.usage,gpuType:a.gpuType,bytes:new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength).slice()});
 const originalPosition=attribute(position),originalIndex=attribute(index),groups=JSON.stringify(geometry.groups),range={...geometry.drawRange},materialVersion=material.version,glslVersion=material.glslVersion,extensions=JSON.stringify(material.extensions),defines=material.defines,uniformKeys=Object.keys(uniforms).sort().join('|'),uniformEntries=Object.fromEntries(Object.entries(uniforms));
 let radius=Infinity;
 for(let i=0;i<index.count;i+=3){
  const [ia,ib,ic]=[index.array[i],index.array[i+1],index.array[i+2]].map(n=>n*3),p=position.array;
  const ax=p[ia],ay=p[ia+1],az=p[ia+2],bx=p[ib]-ax,by=p[ib+1]-ay,bz=p[ib+2]-az,cx=p[ic]-ax,cy=p[ic+1]-ay,cz=p[ic+2]-az;
  const nx=by*cz-bz*cy,ny=bz*cx-bx*cz,nz=bx*cy-by*cx,length=Math.hypot(nx,ny,nz),distance=Math.abs(nx*ax+ny*ay+nz*az)/length;
  counts.facetPlaneEvaluations++;if(!Number.isFinite(distance)||length<=0){radius=NaN;break;}radius=Math.min(radius,distance);
 }
 const margin=Math.max(.001,radius*1e-5),innerRadius=radius-margin,inverse=new T.Matrix4(),point=new T.Vector3();
 const defaultObject=Object.fromEntries(['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'].map(key=>[key,T.Object3D.prototype[key]])),defaultMaterial={onBeforeRender:T.Material.prototype.onBeforeRender,customProgramCacheKey:T.Material.prototype.customProgramCacheKey};
 let invalidated=false,invalidationReason=null,released=false;const invalidate=reason=>{invalidated=true;invalidationReason??=reason;};
 const priorPositionUpload=position.onUploadCallback,priorIndexUpload=index.onUploadCallback,priorCompile=material.onBeforeCompile;
 function positionUpload(...args){counts.uploadNotifications++;try{if(this!==position||!bytesUnchanged(originalPosition,position))invalidate('position-upload-mismatch');const result=priorPositionUpload.apply(this,args);if(!bytesUnchanged(originalPosition,position))invalidate('position-upload-callback-mismatch');return result;}catch(error){invalidate('position-upload-error');throw error;}}
 function indexUpload(...args){counts.uploadNotifications++;try{if(this!==index||!bytesUnchanged(originalIndex,index))invalidate('index-upload-mismatch');const result=priorIndexUpload.apply(this,args);if(!bytesUnchanged(originalIndex,index))invalidate('index-upload-callback-mismatch');return result;}catch(error){invalidate('index-upload-error');throw error;}}
 const compileMatches=shader=>shader?.vertexShader===vertexShader&&shader.fragmentShader===fragmentShader&&Object.keys(shader.defines??{}).length===0&&shader.uniforms===uniforms&&Object.keys(uniforms).sort().join('|')===uniformKeys;
 function compile(...args){counts.compileNotifications++;try{if(this!==material||!compileMatches(args[0]))invalidate('sky-compile-input-mismatch');const result=priorCompile.apply(this,args);if(!compileMatches(args[0]))invalidate('sky-compiled-shader-mismatch');return result;}catch(error){invalidate('sky-compile-error');throw error;}}
 // Normal Three lifecycle contract: owner-held callbacks observe every supported
 // upload/recompile. Current callback replacement fails closed; arbitrary hidden
 // raw-GL writes or malicious callback replace/upload/restore bypasses are not
 // claimed observable. No property slots are sealed or made non-configurable.
 position.onUploadCallback=positionUpload;index.onUploadCallback=indexUpload;material.onBeforeCompile=compile;
 function bytesUnchanged(saved,current){
  if(current!==saved.attribute||current.constructor!==saved.constructor||current.isBufferAttribute!==true||current.isGLBufferAttribute||current.isInterleavedBufferAttribute||current.isInstancedBufferAttribute||current.array!==saved.array||current.array.buffer!==saved.buffer||current.array.byteOffset!==saved.byteOffset||current.array.byteLength!==saved.byteLength||current.itemSize!==saved.itemSize||current.count!==saved.count||current.normalized!==saved.normalized||current.version!==saved.version||current.usage!==saved.usage||current.gpuType!==saved.gpuType)return false;
  const bytes=new Uint8Array(current.array.buffer,current.array.byteOffset,current.array.byteLength);for(let i=0;i<bytes.length;i++)if(bytes[i]!==saved.bytes[i])return false;return true;
 }
 function unchanged(){
  if(invalidated||released||position.onUploadCallback!==positionUpload||index.onUploadCallback!==indexUpload||material.onBeforeCompile!==compile||mesh.geometry!==geometry||mesh.material!==material||geometry.constructor!==T.SphereGeometry||mesh.isSkinnedMesh||mesh.isInstancedMesh||mesh.instanceMatrix||mesh.morphTargetInfluences?.length||Object.keys(geometry.morphAttributes??{}).length||JSON.stringify(geometry.groups)!==groups||geometry.drawRange.start!==range.start||geometry.drawRange.count!==range.count)return false;
  if(material.type!=='ShaderMaterial'||material.isShaderMaterial!==true||material.glslVersion!==glslVersion||JSON.stringify(material.extensions)!==extensions||material.version!==materialVersion||material.vertexShader!==vertexShader||material.fragmentShader!==fragmentShader||material.customProgramCacheKey!==defaultMaterial.customProgramCacheKey||material.onBeforeRender!==defaultMaterial.onBeforeRender||material.displacementMap||material.skinning||material.morphTargets||material.morphNormals||material.defines!==defines||Object.keys(defines??{}).length||material.uniforms!==uniforms||Object.keys(uniforms).sort().join('|')!==uniformKeys)return false;
  for(const key of Object.keys(uniformEntries)){const entry=Object.getOwnPropertyDescriptor(uniforms,key),value=entry&&'value'in entry&&entry.value===uniformEntries[key]?Object.getOwnPropertyDescriptor(entry.value,'value'):null;if(!value||!('value'in value)||typeof value.value!=='number'||!Number.isFinite(value.value))return false;}
  for(let node=mesh;node;node=node.parent)if(node.onBeforeRender!==defaultObject.onBeforeRender||node.onAfterRender!==defaultObject.onAfterRender||node.onBeforeShadow!==defaultObject.onBeforeShadow||node.onAfterShadow!==defaultObject.onAfterShadow)return false;
  counts.byteComparisonChecks++;return bytesUnchanged(originalPosition,geometry.attributes.position)&&bytesUnchanged(originalIndex,geometry.index);
 }
 return {
  contains(camera,corners){
   counts.containmentChecks++;if(!Number.isFinite(innerRadius)||innerRadius<=0||!Array.isArray(corners)||corners.length!==4||!unchanged())return false;
   const matrix=mesh.matrixWorld,e=matrix?.elements,cameraMatrix=camera?.matrixWorld,ce=cameraMatrix?.elements;
   if(!e||!ce||![...e,...ce].every(Number.isFinite)||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1||ce[3]!==0||ce[7]!==0||ce[11]!==0||ce[15]!==1)return false;
   const determinant=matrix.determinant(),scaleProduct=Math.hypot(e[0],e[1],e[2])*Math.hypot(e[4],e[5],e[6])*Math.hypot(e[8],e[9],e[10]);
   if(!Number.isFinite(determinant)||!Number.isFinite(scaleProduct)||scaleProduct<=0||Math.abs(determinant)<=scaleProduct*1e-12)return false;
   inverse.copy(matrix).invert();if(!inverse.elements.every(Number.isFinite))return false;
   // Use the actual camera world origin, including any camera parent transform.
   const eye=[ce[12],ce[13],ce[14]];
   for(const p of [eye,...corners]){if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))return false;point.fromArray(p).applyMatrix4(inverse);if(![point.x,point.y,point.z].every(Number.isFinite)||point.length()>=innerRadius)return false;}
   return true;
  },
  diagnostics:()=>({...counts,innerRadius,facetRadius:radius,margin,snapshotBytes:originalPosition.byteLength+originalIndex.byteLength,invalidated,invalidationReason,released,geometryPolicy:'one-time actual facet-plane inspection plus bounded private byte comparisons at each proof and observed upload',lifecycleScope:'normal owner-held Three upload/compile callbacks; current callback replacement fails closed; arbitrary malicious hidden raw-GL lifecycle bypasses are outside this proof'}),
  release(){if(released)return;released=true;if(position.onUploadCallback===positionUpload)position.onUploadCallback=priorPositionUpload;if(index.onUploadCallback===indexUpload)index.onUploadCallback=priorIndexUpload;if(material.onBeforeCompile===compile)material.onBeforeCompile=priorCompile;}
 };
}
export function buildWebGLNativeSky(environment={}){
 const uniforms={nativeTime:{value:0},nativeHour:{value:environment.timeOfDay??14},nativeCoverage:{value:environment.cloudCoverage??.49},nativeStorm:{value:environment.weather==='storm'?1:0},nativeWind:{value:environment.windSpeed??6}};
 const vertexShader='varying vec3 skyDirection; void main(){ skyDirection=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
 const fragmentShader=`uniform float nativeTime,nativeHour,nativeCoverage,nativeStorm,nativeWind;
 varying vec3 skyDirection;
 float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(skyHash(i),skyHash(i+vec2(1.0,0.0)),f.x),mix(skyHash(i+vec2(0.0,1.0)),skyHash(i+vec2(1.0,1.0)),f.x),f.y);}
 void main(){
  vec3 d=normalize(skyDirection);float daylight=max(0.0,sin((nativeHour-6.0)*3.14159265/12.0));
  vec3 horizon=mix(vec3(.26,.18,.26),vec3(.54,.73,.81),daylight);
  vec3 zenith=mix(vec3(.025,.035,.09),vec3(.17,.42,.65),daylight);
  vec3 color=mix(horizon,zenith,smoothstep(-.07,.8,d.y));
  float cover=clamp(nativeCoverage,0.0,1.0)*smoothstep(-.035,.14,d.y);
  if(cover>.001){
   vec2 uv=d.xz/max(.11,d.y+.27),flow=vec2(nativeTime*nativeWind*.00055,nativeTime*nativeWind*.00018);
   float a=skyNoise(uv*2.5+flow),b=skyNoise(uv*5.0-flow*.7),c=skyNoise(uv*10.0+flow*1.3);
   float cloud=smoothstep(mix(.79,.35,cover),mix(.87,.48,cover),a*.55+b*.30+c*.15);
   vec3 cloudColor=mix(vec3(.16,.19,.24),vec3(.91,.92,.88),daylight*(1.0-nativeStorm*.55));
   color=mix(color,cloudColor,cloud*cover*.9);
  }
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`;
 const material=new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,side:T.BackSide,depthWrite:false,fog:false,toneMapped:false});
 const geometry=new T.SphereGeometry(4200,24,16),mesh=new T.Mesh(geometry,material);mesh.name='native-island-webgl-sky';mesh.frustumCulled=false;mesh.renderOrder=-1000;
 const interior=nativeSkyInteriorCertificate(mesh,material,vertexShader,fragmentShader,uniforms);let disposed=false,unregister;
 const sky={mesh,mediaOcclusionDiagnostics:interior.diagnostics,setEnvironment(value={}){uniforms.nativeHour.value=value.timeOfDay??14;uniforms.nativeCoverage.value=value.cloudCoverage??.49;uniforms.nativeStorm.value=value.weather==='storm'?1:0;uniforms.nativeWind.value=value.windSpeed??6;},update(time,camera){uniforms.nativeTime.value=time;mesh.position.copy(camera.position);},dispose(){if(disposed)return;disposed=true;unregister();interior.release();mesh.removeFromParent();geometry.dispose();material.dispose();}};
 unregister=registerRendererMediaSky(sky,mesh,(camera,corners)=>!disposed&&interior.contains(camera,corners));return Object.freeze(sky);
}
export function buildWebGLNativeSea(source,data,time,shoreTexture,heightTexture=shoreTexture){
 const surfaceExclusions=canonicalWaterSurfaceExclusions(source.ocean.surfaceExclusions??[]),excluded=waterSurfaceExclusionTest(surfaceExclusions,'vSeaWorld','glsl');
 const sea=source.ocean,period=sea.shore.period,wavelength=9.81*period*period/(2*Math.PI),direction=new T.Vector2(source.appearance.swellDir.x,source.appearance.swellDir.y).normalize();
 const seaPositions=[],seaIndices=[],rings=96,sectors=192;for(let r=0;r<=rings;r++)for(let i=0;i<=sectors;i++){const radius=7000*Math.pow(r/rings,2),angle=i/sectors*Math.PI*2;seaPositions.push(Math.cos(angle)*radius,0,Math.sin(angle)*radius);if(r<rings&&i<sectors){const k=r*(sectors+1)+i;seaIndices.push(k,k+sectors+1,k+1,k+1,k+sectors+1,k+sectors+2);}}const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(seaPositions,3));geometry.setIndex(seaIndices);geometry.computeVertexNormals();
 // Source-parameter waves; explicitly no claim of original FFT or optical equivalence.
 const surface=new T.MeshStandardMaterial({color:'#1b697a',roughness:.17,metalness:.15,transparent:true,opacity:.92,side:T.DoubleSide});
 surface.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{nativeTime:time,nativeShore:{value:shoreTexture},nativeDepth:{value:heightTexture},nativeSwell:{value:direction},nativeWave:{value:new T.Vector4(sea.level,sea.shore.amplitude,2*Math.PI/wavelength,2*Math.PI/period)}});
  shader.vertexShader=`uniform float nativeTime;uniform vec2 nativeSwell;uniform vec4 nativeWave;varying vec3 vSeaWorld;
`+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 float phase=dot(position.xz,nativeSwell)*nativeWave.z-nativeTime*nativeWave.w;transformed.y=nativeWave.x+nativeWave.y*sin(phase);vSeaWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
  shader.fragmentShader=`uniform float nativeTime;uniform sampler2D nativeShore,nativeDepth;uniform vec2 nativeSwell;uniform vec4 nativeWave;varying vec3 vSeaWorld;
`+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 shoreUV=(vSeaWorld.xz-(${data.origin.toFixed(1)}))/${data.size.toFixed(1)};
 vec4 shore=texture2D(nativeShore,clamp(shoreUV,vec2(0.0),vec2(1.0)));
 float inDomain=step(0.0,shoreUV.x)*step(shoreUV.x,1.0)*step(0.0,shoreUV.y)*step(shoreUV.y,1.0);
 float waterDepth=max(nativeWave.x-texture2D(nativeDepth,clamp(shoreUV,vec2(0.0),vec2(1.0))).r,0.0);
 float shoreline=(1.0-smoothstep(1.0,18.0,waterDepth))*(1.0-step(9000.0,shore.x))*clamp(length(shore.yz),0.0,1.0)*inDomain;
 float phase=dot(vSeaWorld.xz,nativeSwell)*nativeWave.z-nativeTime*nativeWave.w;
 float breakup=.5+.27*sin(vSeaWorld.x*.24+nativeTime*.35)*sin(vSeaWorld.z*.19-nativeTime*.21)+.23*sin(vSeaWorld.x*.67+vSeaWorld.z*.41+nativeTime*.48);
 float front=abs(fract(shore.x/max(${period.toFixed(6)},.01)-nativeTime/${period.toFixed(6)}+breakup*.035)-.5);
 float foam=(1.0-smoothstep(.012,.055+fwidth(front),front))*smoothstep(.48,.82,breakup)*shoreline*.72;
 vec3 seaN=normalize(vec3(-nativeSwell.x*nativeWave.y*nativeWave.z*cos(phase),1.0,-nativeSwell.y*nativeWave.y*nativeWave.z*cos(phase)));
 float fresnel=pow(1.0-max(dot(seaN,normalize(cameraPosition-vSeaWorld)),0.0),3.0);
 vec3 deep=vec3(.018,.19,.24),shallow=vec3(.09,.38,.40);
 diffuseColor.rgb=mix(deep,shallow,shoreline*.7)*(.87+.13*breakup);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.36,.54,.57),fresnel*.5);
 float ripple=sin(dot(vSeaWorld.xz,vec2(.37,.13))+nativeTime*.9)*sin(dot(vSeaWorld.xz,vec2(-.18,.43))-nativeTime*.63);
 float rippleFade=1.0-smoothstep(.5,2.0,fwidth(dot(vSeaWorld.xz,vec2(.37,.13))));
 diffuseColor.rgb*=1.0+ripple*.07*rippleFade;
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.79,.87,.82),foam);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 float wavePhase=dot(vSeaWorld.xz,nativeSwell)*nativeWave.z-nativeTime*nativeWave.w;
 float waveSlope=nativeWave.y*nativeWave.z*cos(wavePhase);
 vec3 seaNormal=normalize(vec3(-nativeSwell.x*waveSlope+.045*sin(dot(vSeaWorld.xz,vec2(.37,.13))+nativeTime*.9),1.0,-nativeSwell.y*waveSlope+.045*cos(dot(vSeaWorld.xz,vec2(-.18,.43))-nativeTime*.63)));
 normal=normalize(mat3(viewMatrix)*seaNormal);`);
  shader.fragmentShader=shader.fragmentShader.replace(/}\s*$/, 'if('+excluded+'){discard;}\n}');
 };surface.customProgramCacheKey=()=> 'native-analytic-sea-webgl/2:'+JSON.stringify(surfaceExclusions);const mesh=new T.Mesh(geometry,surface);mesh.frustumCulled=false;mesh.userData.repositoryWater=true;
 const depth=new T.MeshDepthMaterial({side:T.DoubleSide});
 depth.onBeforeCompile=shader=>{
  const colorShader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};surface.onBeforeCompile(colorShader);
  Object.assign(shader.uniforms,colorShader.uniforms);
  shader.vertexShader=colorShader.vertexShader.slice(0,colorShader.vertexShader.indexOf('#define STANDARD'))+shader.vertexShader;
  const displacement=colorShader.vertexShader.match(/#include <begin_vertex>([\s\S]*?)#include <morphtarget_vertex>/)?.[1];
  if(!displacement)throw Error('Native sea depth displacement unavailable');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>'+displacement);
  shader.fragmentShader='varying vec3 vSeaWorld;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace(/}\s*$/, 'if('+excluded+'){discard;}\n}');
 };
 depth.customProgramCacheKey=()=> 'native-analytic-sea-depth-webgl/1:'+JSON.stringify(surfaceExclusions);mesh.customDepthMaterial=depth;
 const cpu=new Float32Array(4);let x=0,z=0;const height=()=>sea.level+sea.shore.amplitude*Math.sin((x*direction.x+z*direction.y)*2*Math.PI/wavelength-time.value*2*Math.PI/period);const query={cpu,cpuValid:true,allocate:()=>0,setPoint(_slot,nx,nz){x=nx;z=nz;cpu[0]=height();},setTime(t){time.value=t;cpu[0]=height();}};return{mesh,query,seaLevel:sea.level,surfaceExclusionsEnforced:true,surfaceExclusions,getSurfaceExclusions:()=>surfaceExclusions,dispose(){geometry.dispose();surface.dispose();depth.dispose();mesh.removeFromParent();}};
}
export async function buildWebGLNativeIsland({project,root,camera,options={}}){
 if(typeof options.readNativeIsland!=='function')throw Error('WebGL native island needs its verified source reader.');
 const source=await options.readNativeIsland(project),data=new NativeIslandTerrain({...source.domain,coarse:source.coarse}),group=new T.Group(),time={value:0};root.add(group);
 let disposed=false,bark,plants,water,sky,cache,plantMaterials;const ownedTextures=[],tileMeshes=new Map(),arrivalLeases=new Set();
 const dispose=()=>{if(disposed)return;disposed=true;for(const release of arrivalLeases)release();cache?.dispose();source.dispose?.();plants?.dispose();water?.dispose();sky?.dispose();bark?.dispose();if(plantMaterials)for(const material of Object.values(plantMaterials))material.dispose();for(const mesh of tileMeshes.values()){mesh.geometry.dispose();mesh.material.dispose();mesh.userData.nativeTextures.forEach(t=>t.dispose());}tileMeshes.clear();group.traverse(node=>{if(node.userData.nativeBase){node.geometry.dispose();node.material.dispose();}});group.removeFromParent();for(const value of ownedTextures)value.dispose();};
 try{
  bark=await(options.prepareVegetationAssets??barkTextures)(source);const leafAtlas=await(options.prepareLeafAtlas??loadNativeLeafAtlas)();ownedTextures.push(leafAtlas);const nativeDetail=getDetailTexture({upload:false}),detail=texture(nativeDetail.image.data,nativeDetail.width);detail.wrapS=detail.wrapT=T.RepeatWrapping;detail.generateMipmaps=true;detail.minFilter=T.LinearMipmapLinearFilter;ownedTextures.push(detail);
  const grass=texture(source.grassMask.data,source.grassMask.res),shore=texture(source.shore.data,source.shore.res,4,T.FloatType),coarseHeight=texture(source.coarse.heights,source.coarse.res,1,T.FloatType),coarseNormal=texture(source.coarse.normal,source.coarse.res),coarseSplat=texture(source.coarse.splat,source.coarse.res),side=Math.ceil(source.domain.res/128),readyData=new Uint8Array(side*side),ready=texture(readyData,side,1);ready.magFilter=ready.minFilter=T.NearestFilter;ownedTextures.push(grass,shore,coarseHeight,coarseNormal,coarseSplat,ready);
  const windDirection = source.ocean.fft.local.windDirection * Math.PI / 180;
  const materialFor=(normal,splat,rect,coarse)=>terrainMaterial({normal,splat,rect,domain:source.domain,detail,shore,grass,ready,coarse,time,windDirection});
  const base=new T.Mesh(webGLNativeTerrainTile(data,{x:0,z:0,width:data.res-1,height:data.res-1},Math.round(data.res/source.coarse.res)),materialFor(coarseNormal,coarseSplat,[data.origin,data.origin,data.size,data.size],true));base.userData.nativeBase=true;group.add(base);
  cache=new NativeIslandTiles({tiles:source.tiles,readTile:source.readTile,maxBytes:options.maxBytes,maxConcurrency:options.maxConcurrency,onLoad(tile,decoded){const fields=decoded.fields??decoded;data.apply(tile,decoded);const normal=texture(fields.normal,tile.width),splat=texture(fields.splat,tile.width),mesh=new T.Mesh(webGLNativeTerrainTile(data,tile),materialFor(normal,splat,[data.origin+tile.x,data.origin+tile.z,tile.width,tile.height],false));mesh.userData.nativeTextures=[normal,splat];tileMeshes.set(tile.id,mesh);group.add(mesh);readyData[Math.floor(tile.z/128)*side+Math.floor(tile.x/128)]=255;ready.needsUpdate=true;for(const other of source.tiles){const resident=tileMeshes.get(other.id);if(resident)updateWebGLNativeTerrainSeam(data,other,resident.geometry,tile);}},onEvict(tile){const mesh=tileMeshes.get(tile.id);if(mesh){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();mesh.userData.nativeTextures.forEach(t=>t.dispose());tileMeshes.delete(tile.id);}readyData[Math.floor(tile.z/128)*side+Math.floor(tile.x/128)]=0;ready.needsUpdate=true;}});data.cache=cache;
  const wind={value:new T.Vector2(Math.sin(windDirection),Math.cos(windDirection))},gust={value:new T.Vector2()};
  const materials=plantMaterials={palm:plantMaterial('palm',time,wind,gust,detail,bark.palm,leafAtlas),tree:plantMaterial('tree',time,wind,gust,detail,bark.tree,leafAtlas)};plants=buildPlants(source,time,detail,materials,options.mainCamera??camera);group.add(plants.root);water=buildWebGLNativeSea(source,data,time,shore,coarseHeight);group.add(water.mesh);sky=buildWebGLNativeSky(project.environment);group.add(sky.mesh);
  const frustum=new T.Frustum(),vp=new T.Matrix4(),box=new T.Box3(),updateSkyAndTiles=viewCamera=>{sky.update(time.value,viewCamera);viewCamera.updateMatrixWorld();vp.multiplyMatrices(viewCamera.projectionMatrix,viewCamera.matrixWorldInverse);frustum.setFromProjectionMatrix(vp);const {x,z}=viewCamera.position;cache.requestView(x,z,2400,tile=>{box.min.set(tile.bounds[0],tile.minHeight??-90,tile.bounds[1]);box.max.set(tile.bounds[2],tile.maxHeight??200,tile.bounds[3]);return frustum.intersectsBox(box)||Math.hypot((tile.bounds[0]+tile.bounds[2])/2-x,(tile.bounds[1]+tile.bounds[3])/2-z)<180;});};
  let exactPlantView=false;
  const bindView=viewCamera=>{updateSkyAndTiles(viewCamera);plants.updateView(viewCamera,exactPlantView);};
  return{data,water,sky,query:water.query,setPlantOccluders:plants.setOccluders,setPlantOcclusionEnabled:plants.setOcclusionEnabled,setEnvironment(value){sky.setEnvironment(value);},async ensureArrival(position){const release=await cache.ensureAt(position[0],position[2],3);arrivalLeases.add(release);return()=>{arrivalLeases.delete(release);release();};},canOccupy(x,z,radius=1){return [[x-radius,z-radius],[x+radius,z-radius],[x-radius,z+radius],[x+radius,z+radius]].every(([px,pz])=>cache.readyAt(px,pz));},bindView,update(dt,viewCamera,preparePlants=true){exactPlantView=!preparePlants;time.value+=dt;gust.value.addScaledVector(wind.value,(.7*(project.environment.windSpeed??7)+1.5)*dt);if(preparePlants)bindView(viewCamera);else updateSkyAndTiles(viewCamera);},stats:()=>({...WEBGL_NATIVE_ISLAND_QUALIFICATION,...cache.stats(),plants:plants.stats(),source:source.sourceStats?.(),terrainPolicy:'exact fine cell heights and captured normal/splat; approximate GLSL surface shading',grassPolicy:'captured density field; blades not implemented'}),dispose};
 }catch(error){dispose();throw error;}
}
