import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {isEligibleWebGLDepthOccluder} from '../src/world-runtime/WebGLOpaqueDepthPrepass.js';
import {createWarehouseSurfaces,warehouseSurfaceSpec,warehouseSurfaceBatchKey,warehouseAlbedoMeans,WAREHOUSE_SURFACE_WORLD,WAREHOUSE_RECIPE_SOURCE} from '../src/world-runtime/WarehouseSurfaces.js';

const asset={id:'warehouse:box-brick',source:WAREHOUSE_RECIPE_SOURCE};
const object={id:'warehouse:object:0020',name:'east wall'};
const spec=warehouseSurfaceSpec(WAREHOUSE_SURFACE_WORLD,asset,object);
const bitmap=()=>({width:32,height:32,closes:0,close(){this.closes++;}});
test('surface scope rejects foreign worlds, imported assets, overrides, screens, and replacement provenance',()=>{
 assert.equal(spec.family,'brick');
 for(const [world,a,o,terminal]of [
  ['foreign',asset,object], [WAREHOUSE_SURFACE_WORLD,{...asset,id:'library:box-brick'},object],
  [WAREHOUSE_SURFACE_WORLD,{...asset,source:WAREHOUSE_RECIPE_SOURCE+' changed'},object],
  [WAREHOUSE_SURFACE_WORLD,asset,{...object,id:'new-object'}],
  [WAREHOUSE_SURFACE_WORLD,asset,{...object,materialOverrides:[{materialIndex:0,color:'#fff'}]}],
  [WAREHOUSE_SURFACE_WORLD,asset,{...object,name:'terminal screen'}],
  [WAREHOUSE_SURFACE_WORLD,asset,object,'c64'],
 ])assert.equal(warehouseSurfaceSpec(world,a,o,terminal),null);
});
test('brick UVs have metre scale on every box face and retain stock occluder qualification',async()=>{
 const decoded=[],surfaces=createWarehouseSurfaces({fetchImage:async()=>{const b=bitmap();decoded.push(b);return b;}});
 const maps=await surfaces.ready('brick'),geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial();
 const matrix=new T.Matrix4().makeScale(12,6,.4);
 assert.equal(surfaces.apply(spec,geometry,material,matrix,maps,4),true);
 const mesh=new T.InstancedMesh(geometry,material,4);
 assert.equal(isEligibleWebGLDepthOccluder(mesh),true);
 assert.equal(material.onBeforeCompile,T.Material.prototype.onBeforeCompile);
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
 for(let i=0;i<p.count;i++){
  const expected=Math.abs(n.getY(i))>.55?Math.abs(p.getX(i)*4):Math.abs(n.getX(i))>.55?Math.abs(p.getZ(i)*.4/3):Math.abs(p.getX(i)*4);
  assert.ok(Math.abs(Math.abs(uv.getX(i))-expected)<1e-6);
 }
 assert.notEqual(warehouseSurfaceBatchKey(spec,matrix),warehouseSurfaceBatchKey(spec,new T.Matrix4().makeScale(3,6,.4)));
 assert.equal(maps[0].colorSpace,T.SRGBColorSpace);assert.equal(maps[1].colorSpace,T.NoColorSpace);assert.equal(maps[2].colorSpace,T.NoColorSpace);
 assert.equal(maps[0].wrapS,T.RepeatWrapping);assert.equal(maps[0].flipY,false);
 surfaces.dispose();surfaces.dispose();assert.deepEqual(decoded.map(b=>b.closes),[1,1,1]);geometry.dispose();material.dispose();
});
test('fabric and timber preserve batching with UV-only per-instance projection and shared texture ownership',async()=>{
 let reads=0;const surfaces=createWarehouseSurfaces({fetchImage:async()=>{reads++;return bitmap();}});
 const maps=await surfaces.ready('wood');assert.equal(await surfaces.ready('wood'),maps);assert.equal(reads,3);
 const wood=warehouseSurfaceSpec(WAREHOUSE_SURFACE_WORLD,{...asset,id:'warehouse:box-wood'},object);
 const matrix=new T.Matrix4().makeScale(14,.22,8),material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry();
 surfaces.apply(wood,geometry,material,matrix,maps,7);
 assert.equal(warehouseSurfaceBatchKey(wood,matrix),'');
 const shader={vertexShader:'#include <uv_vertex>\n#include <begin_vertex>'};material.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/length\(instanceMatrix\[0\]\.xyz\)/);assert.match(shader.vertexShader,/vNormalMapUv=warehouseUv/);
 assert.ok(shader.vertexShader.endsWith('#include <begin_vertex>'));
 assert.equal(surfaces.stats.byMaterial.wood,7);
 const glass=new T.MeshStandardMaterial({transparent:true,opacity:.5});
 assert.equal(surfaces.apply(wood,geometry,glass,matrix,maps,1),false);assert.equal(glass.map,null);
 surfaces.dispose();geometry.dispose();material.dispose();glass.dispose();
});
test('a failed family closes successful sibling decodes exactly once',async()=>{
 const images=[];let reads=0;
 const surfaces=createWarehouseSurfaces({fetchImage:async()=>{if(++reads===2)throw Error('decode failed');const b=bitmap();images.push(b);return b;}});
 await assert.rejects(surfaces.ready('fabric'),/decode failed/);assert.deepEqual(images.map(b=>b.closes),[1,1]);
 surfaces.dispose();assert.deepEqual(images.map(b=>b.closes),[1,1]);
});
test('coloured albedo detail preserves the authored mean reflectance and upholstery differences',async()=>{
 const surfaces=createWarehouseSurfaces({fetchImage:async()=>bitmap()}),geometry=new T.BoxGeometry(),matrix=new T.Matrix4();
 const colours={brick:'#70453b',polishedTile:'#30302e',wood:'#765238',fabric:'#8f8578',charcoal:'#303332',rugLight:'#a89a86'};
 for(const [name,color]of Object.entries(colours)){
  const s=warehouseSurfaceSpec(WAREHOUSE_SURFACE_WORLD,{...asset,id:'warehouse:box-'+name},object),m=new T.MeshStandardMaterial({color});
  const authored=m.color.clone(),maps=await surfaces.ready(s.family);surfaces.apply(s,geometry,m,matrix,maps,1);
  const mean=warehouseAlbedoMeans[s.family];
  for(const [axis,i]of [['r',0],['g',1],['b',2]]){
   assert.ok(Math.abs(m.color[axis]*mean[i]-authored[axis])<1e-12,name+' '+axis+' mean');
   assert.ok(Math.abs((m.color[axis]*mean[i]*1.2)/(m.color[axis]*mean[i]*.8)-1.5)<1e-12,name+' detail contrast');
  }
  m.dispose();
 }
 surfaces.dispose();geometry.dispose();
});
test('authored steel/rust scratches use no textures or batching split and retain base colour',async()=>{
 const surfaces=createWarehouseSurfaces({fetchImage:async()=>{throw Error('metal must not load maps');}}),geometry=new T.BoxGeometry();
 for(const name of ['steel','rust']){
  const s=warehouseSurfaceSpec(WAREHOUSE_SURFACE_WORLD,{...asset,id:'warehouse:box-'+name},object),m=new T.MeshStandardMaterial({color:'#20282a'}),original=m.color.clone();
  assert.equal(warehouseSurfaceBatchKey(s,new T.Matrix4()),'');
  surfaces.apply(s,geometry,m,new T.Matrix4(),await surfaces.ready(s.family),8);assert.deepEqual(m.color,original);assert.equal(m.map,null);
  const shader={vertexShader:'#include <project_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>'};m.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/fwidth\(warehouseWearY\)/);assert.match(shader.fragmentShader,/smoothstep\(16.0,196.0/);assert.match(shader.fragmentShader,/roughnessFactor\+warehouseWear\*\.18/);m.dispose();
 }
 surfaces.dispose();geometry.dispose();
});
