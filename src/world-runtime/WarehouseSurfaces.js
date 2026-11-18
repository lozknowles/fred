import {T} from './vendor/world-engine-contract.js';
import {warehouseMaps} from './WarehouseGraphicsAssets.js';

export const WAREHOUSE_SURFACE_WORLD='elsemesh.world:2842c4f2-93a0-4492-b942-e53e524de319';
export const WAREHOUSE_RECIPE_SOURCE='ElseMesh PortalInteriorRecipe.js @ f91cabbd4bac784076095b73ac45ec1ffc5da9f0; recipe SHA256 efb73bea8e5e81cb7cccc6b8a5449c51b31137a73044d132b91dfaf499f1666c';
const specs={
 brick:{family:'brick',metres:3,baked:true},brickDark:{family:'brick',metres:3,baked:true},
 polishedTile:{family:'floor',metres:3.15},concrete:{family:'floor',metres:3.15},concreteDark:{family:'floor',metres:3.15},
 wood:{family:'wood',metres:2},charredWood:{family:'wood',metres:2},
 fabric:{family:'fabric',metres:1.15},charcoal:{family:'fabric',metres:1.15},rug:{family:'fabric',metres:1.15},rugLight:{family:'fabric',metres:1.15},rugStair:{family:'fabric',metres:1.15},
 steel:{family:'scratchedMetal',procedural:true},rust:{family:'scratchedMetal',procedural:true},
};
// In these authored prefabs slot zero is the seat or top. Slot one is hardware.
const furnitureTops = new Map([
 ['warehouse-prefab:dining-chair', ['883beed03be68ce90892f9e108fde50029b9d712bbe39a81561c4ebcc4e8154c', 'charcoal']],
 ['warehouse-prefab:dining-table', ['82e4a0c60f5630e404c10af39c8708957857348650919e03508e2206df73f649', 'wood']],
 ['warehouse-prefab:large-nesting-table', ['3f498c2af5379ace7a8e77fdcbceb93a527ac9bd6095a2cf3c1cca5682458f5e', 'wood']],
 ['warehouse-prefab:small-nesting-table', ['e63413a44817d9c1b56720a000f8aa9a1a023e24a109b3e87df7a301c63e14f0', 'concreteDark']],
 ['warehouse-prefab:side-table', ['3e8f0f308d98f84df31ae8344934e8e0b10b92f93f33b7c8759e939c51727d6c', 'wood']],
 ['warehouse-prefab:mezzanine-side-table', ['d64736602ae0bf83349f4054924ced8441ba44b3b86fecd47ced88d0ef2af26e', 'charredWood']],
]);

export async function warehouseFurnitureSurface(worldId, assetId, bytes, digest) {
 const recipe = worldId === WAREHOUSE_SURFACE_WORLD && furnitureTops.get(assetId);
 if (!recipe || await digest(bytes) !== recipe[0]) return null;
 return {...specs[recipe[1]], material: recipe[1]};
}
// Linear RGB means from deterministic 128x128 centre samples of the shipped
// sRGB albedos (IEC 61966-2-1 transfer). These maps already contain material
// colour: divide it out of the multiplier so the recipe colour remains the
// mean reflectance, rather than multiplying two dark coloured surfaces.
export const warehouseAlbedoMeans={
 brick:[.13918648,.07688402,.05111679],floor:[.38461960,.24039111,.13526759],
 fabric:[.01948064,.01978189,.02618395],wood:[.12100031,.07448921,.04465453],
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
const staticMetalHooks=new WeakMap();
// These installed hooks add varyings and surface wear, never vertex displacement.
export function hasWarehouseStaticVertexHook(material,compile=material.onBeforeCompile,key=material.customProgramCacheKey){
 const proof=staticMetalHooks.get(material);return !!proof&&compile===proof.compile&&key===proof.key;
}
function installMetalWear(material){
 material.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 vWarehouseWearPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 warehouseWearPosition=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
    warehouseWearPosition=instanceMatrix*warehouseWearPosition;
   #endif
   vWarehouseWearPosition=(modelMatrix*warehouseWearPosition).xyz;
   #include <project_vertex>`);
  shader.fragmentShader='varying vec3 vWarehouseWearPosition;\n'+shader.fragmentShader;
  // PortalInterior's sparse .28 darkening / .18 roughness scratches, with
  // derivative filtering and a close-range fade instead of distant shimmer.
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float warehouseWearY=vWarehouseWearPosition.y*45.0;
   float warehouseWearAA=max(fwidth(warehouseWearY),.001);
   float warehouseWearLine=1.0-smoothstep(.025,.025+warehouseWearAA,abs(fract(warehouseWearY)-.5));
   float warehouseWearMask=step(.94,fract(sin(dot(floor(vWarehouseWearPosition.xy*vec2(7.0,.6)),vec2(19.19,73.31)))*3157.7));
   vec3 warehouseWearView=cameraPosition-vWarehouseWearPosition;
   float warehouseWear=warehouseWearLine*warehouseWearMask*(1.0-smoothstep(16.0,196.0,dot(warehouseWearView,warehouseWearView)));
   diffuseColor.rgb*=1.0-warehouseWear*.28;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=min(1.0,roughnessFactor+warehouseWear*.18);');
 };
 material.customProgramCacheKey=()=> 'warehouse-metal-wear/1';
 staticMetalHooks.set(material,{compile:material.onBeforeCompile,key:material.customProgramCacheKey});
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
  if(family==='scratchedMetal')return Promise.resolve([]);
  if(!families.has(family))families.set(family,(async()=>{
   const results=await Promise.allSettled(warehouseMaps[family].map((path,i)=>load(path,i===0)));
   const failed=results.find(r=>r.status==='rejected');if(failed){for(const r of results)if(r.status==='fulfilled'){textures.delete(r.value);r.value.dispose();}throw failed.reason;}
   return results.map(r=>r.value);
  })());return families.get(family);
 };
 return {stats,ready,dispose(){if(disposed)return;disposed=true;for(const t of textures)t.dispose();textures.clear();},
  apply(spec,geometry,material,matrix,maps,objectCount){
   if(!material.isMeshStandardMaterial||material.transparent||material.opacity!==1||material.transmission||material.alphaTest||material.alphaMap||material.map||material.emissive?.getHex())return false;
   if(spec.procedural){installMetalWear(material);material.needsUpdate=true;stats.objects+=objectCount;stats.batches++;counts[spec.material]=(counts[spec.material]??0)+objectCount;return true;}
   [material.map,material.normalMap,material.roughnessMap]=maps;
   const mean=warehouseAlbedoMeans[spec.family];
   material.color.r/=mean[0];material.color.g/=mean[1];material.color.b/=mean[2];
   material.normalScale.setScalar(spec.family==='fabric'?.35:spec.family==='wood'?.55:.65);
   // Packed ARM uses green roughness; the greyscale fabric/wood roughness maps work in every channel.
   if(spec.family==='brick')material.roughness=1;
   if(spec.family==='floor'&&spec.material==='polishedTile')material.roughness=.55;
   if(spec.baked)bakeWarehouseSurfaceUV(geometry,matrix,spec.metres);else installMetricUV(material,spec.metres);
   material.needsUpdate=true;stats.objects+=objectCount;stats.batches++;counts[spec.material]=(counts[spec.material]??0)+objectCount;return true;
  },
 };
}
