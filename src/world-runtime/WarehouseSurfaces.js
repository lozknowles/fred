import {T} from './vendor/world-engine-contract.js';
import {warehouseMaps} from './WarehouseGraphicsAssets.js';

export const WAREHOUSE_SURFACE_WORLD='elsemesh.world:2842c4f2-93a0-4492-b942-e53e524de319';
export const WAREHOUSE_RECIPE_SOURCE='ElseMesh PortalInteriorRecipe.js @ f91cabbd4bac784076095b73ac45ec1ffc5da9f0; recipe SHA256 efb73bea8e5e81cb7cccc6b8a5449c51b31137a73044d132b91dfaf499f1666c';
const specs={
 brick:{family:'brick',metres:3,baked:true},brickDark:{family:'brick',metres:3,baked:true},
 polishedTile:{family:'floor',metres:3.15},concrete:{family:'floor',metres:3.15},concreteDark:{family:'floor',metres:3.15},
 wood:{family:'wood',metres:2},charredWood:{family:'wood',metres:2},
 fabric:{family:'fabric',metres:1.15},charcoal:{family:'fabric',metres:1.15},rug:{family:'fabric',metres:1.15},rugLight:{family:'fabric',metres:1.15},rugStair:{family:'fabric',metres:1.15},
};
/** Only the original recipe exports are admitted; library and replacement GLBs retain their materials. */
export function warehouseSurfaceSpec(worldId,asset,object,terminal){
 if(worldId!==WAREHOUSE_SURFACE_WORLD||terminal||object.materialOverrides?.length||object.ambientBehaviour||
  !/^warehouse:object:\d{4}$/.test(object.id)||/screen|terminal|glass|print|picture|book/i.test(object.name??'')||
  asset?.source!==WAREHOUSE_RECIPE_SOURCE)return null;
 const match=/^warehouse:(box|sphere|cylinder)-([A-Za-z]+)$/.exec(asset.id);
 return match&&specs[match[2]]?{...specs[match[2]],material:match[2]}:null;
}
export function warehouseSurfaceBatchKey(spec,matrix){
 return spec?.baked?new T.Vector3().setFromMatrixScale(matrix).toArray().map(v=>v.toFixed(6)).join(','):'';
}
/** Object-local face projection keeps grain/brick sizes independent of saved object scale. */
export function bakeWarehouseSurfaceUV(geometry,matrix,metres){
 const scale=new T.Vector3().setFromMatrixScale(matrix),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i)*scale.x,y=p.getY(i)*scale.y,z=p.getZ(i)*scale.z;
  const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
  if(Math.abs(ny)>.55)uv.push(x/metres,-z*Math.sign(ny)/metres);
  else if(Math.abs(nx)>Math.abs(nz))uv.push(-z*Math.sign(nx)/metres,y/metres);
  else uv.push(x*Math.sign(nz)/metres,y/metres);
 }
 geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
}
function installMetricUV(material,metres){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
   vec3 warehouseScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
   vec3 warehouseP=position*warehouseScale;
   vec2 warehouseUv=abs(normal.y)>.55?vec2(warehouseP.x,-warehouseP.z*sign(normal.y)):
    abs(normal.x)>abs(normal.z)?vec2(-warehouseP.z*sign(normal.x),warehouseP.y):vec2(warehouseP.x*sign(normal.z),warehouseP.y);
   warehouseUv/=${Number(metres).toFixed(8)};
   vMapUv=warehouseUv;vNormalMapUv=warehouseUv;vRoughnessMapUv=warehouseUv;`);
 };
 material.customProgramCacheKey=()=>`warehouse-metric-uv/1/${metres}`;
}
export function createWarehouseSurfaces({baseUrl=import.meta.env?.BASE_URL??'/',fetchImage=async url=>{
 const response=await fetch(url);if(!response.ok)throw Error('Warehouse surface read failed: '+url);
 // Bitmap upload ignores Texture.flipY: request the authored lower-left UV convention at decode time.
 return createImageBitmap(await response.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
}}={}){
 const textures=new Set(),families=new Map(),counts={},stats={objects:0,batches:0,byMaterial:counts};let disposed=false;
 const load=async(path,srgb)=>{
  const bitmap=await fetchImage(baseUrl+path);let texture;
  try{
   if(disposed||bitmap.width>2048||bitmap.height>2048)throw Error('Warehouse surface decoded budget exceeded or disposed');
   texture=new T.Texture(bitmap);texture.flipY=false;texture.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;
   texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;texture.needsUpdate=true;texture.userData.warehouseSurfaceOwned=true;
   let closed=false;texture.addEventListener('dispose',()=>{if(!closed){closed=true;bitmap.close();}});textures.add(texture);return texture;
  }catch(error){texture?.dispose();if(!texture)bitmap.close();else if(!textures.has(texture))bitmap.close();throw error;}
 };
 const ready=family=>{
  if(!families.has(family))families.set(family,(async()=>{
   const results=await Promise.allSettled(warehouseMaps[family].map((path,i)=>load(path,i===0)));
   const failed=results.find(r=>r.status==='rejected');if(failed){for(const r of results)if(r.status==='fulfilled'){textures.delete(r.value);r.value.dispose();}throw failed.reason;}
   return results.map(r=>r.value);
  })());return families.get(family);
 };
 return {stats,ready,dispose(){if(disposed)return;disposed=true;for(const t of textures)t.dispose();textures.clear();},
  apply(spec,geometry,material,matrix,maps,objectCount){
   if(!material.isMeshStandardMaterial||material.transparent||material.opacity!==1||material.transmission||material.alphaTest||material.alphaMap||material.map||material.emissive?.getHex())return false;
   [material.map,material.normalMap,material.roughnessMap]=maps;
   material.normalScale.setScalar(spec.family==='fabric'?.35:spec.family==='wood'?.55:.65);
   // Packed ARM uses green roughness; the greyscale fabric/wood roughness maps work in every channel.
   if(spec.family==='brick')material.roughness=1;
   if(spec.family==='floor'&&spec.material==='polishedTile')material.roughness=.55;
   if(spec.baked)bakeWarehouseSurfaceUV(geometry,matrix,spec.metres);else installMetricUV(material,spec.metres);
   material.needsUpdate=true;stats.objects+=objectCount;stats.batches++;counts[spec.material]=(counts[spec.material]??0)+objectCount;return true;
  },
 };
}
