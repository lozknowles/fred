import test from 'node:test';
import assert from 'node:assert/strict';
import {T,resolveWorldMatrices} from '../src/world-runtime/vendor/world-engine-contract.js';
import {disposeWebGLRepositoryScene} from '../src/world-runtime/WebGLRepositoryScene.js';
import {buildRecipe} from '../src/world/PortalInteriorRecipe.js';
import {buildWarehouseLettering,warehouseLetteringSpec,buildWarehouseLetteringAtlas} from '../src/world-runtime/WarehouseLettering.js';
import {WAREHOUSE_SURFACE_WORLD as world,WAREHOUSE_RECIPE_SOURCE as source} from '../src/world-runtime/WarehouseSurfaces.js';
const recipe=buildRecipe();
const objects=recipe.objects.map((o,i)=>({id:'warehouse:object:'+String(i).padStart(4,'0'),name:o.name,kind:'glb',assetId:`warehouse:${o.shape}-${o.material}`,position:[o.position[0],o.position[1]+3,o.position[2]-80],rotation:o.rotation,scale:o.size,visible:!o.name.endsWith('keyboard legends')}));
const assets=[...new Set(objects.map(o=>o.assetId))].map(id=>({id,source}));
const project={objects,assets};
const canvas=()=>({getContext:()=>({clearRect(){},fillText(){}})});
const spec=o=>warehouseLetteringSpec(world,assets.find(a=>a.id===o.assetId),o);
test('only exact authored physical key and nameplate identities with original provenance are eligible',()=>{
 const o=objects.find(o=>o.name==='c64 key r0 k0'),a=assets.find(a=>a.id===o.assetId);
 assert.equal(spec(o).label,'1');assert.equal(spec(objects.find(o=>o.name==='c64 key r0 k12')).label,'DEL');
 assert.equal(spec(objects.find(o=>o.name==='sun key r0 k13')).label,'ESC');
 for(const [w,asset,obj] of [['other',a,o],[world,{...a,source:'replacement'},o],[world,a,{...o,id:'warehouse:object:0001'}],[world,a,{...o,name:'c64 key r0 k1'}],[world,a,{...o,materialOverrides:[{}]}],[world,a,{...o,collisionOnly:true}]])assert.equal(warehouseLetteringSpec(w,asset,obj),null);
 for(const o of objects.filter(o=>o.name.endsWith('keyboard legends')))assert.equal(spec(o),null);
});
test('all actual visible keys and nameplates share one static alpha-tested, mipmapped atlas',()=>{
 const matrices=resolveWorldMatrices(objects),mesh=buildWarehouseLettering(world,project,matrices,{createCanvas:canvas});
 const keys=objects.filter(o=>/^(c64|bbc|sun) (key r|space key|left shift key|return key|function key)/.test(o.name));
 assert.equal(mesh.count,keys.length+3);assert.equal(mesh.count,195);
 assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.side,T.FrontSide);assert.equal(mesh.material.map.minFilter,T.LinearMipmapLinearFilter);assert.equal(mesh.material.map.generateMipmaps,true);
 assert.equal(mesh.geometry.getAttribute('warehouseGlyphRect').count,mesh.count);
 assert.equal(mesh.userData.warehouseLettering.drawCalls,1);
 const shader={vertexShader:'#include <uv_vertex>'};mesh.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/vMapUv=warehouseGlyphRect/);
 assert.equal(buildWarehouseLettering('foreign',project,matrices),null);
 const hidden={...project,objects:objects.map(o=>({...o,visible:false}))};assert.equal(buildWarehouseLettering(world,hidden,matrices),null);
 mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();
});
test('front-only winding and transforms put text on +Y key tops and -Z nameplate fronts',()=>{
 const mesh=buildWarehouseLettering(world,project,resolveWorldMatrices(objects),{createCanvas:canvas}),m=new T.Matrix4();
 const p=mesh.geometry.getAttribute('position'),idx=mesh.geometry.index;
 const a=new T.Vector3().fromBufferAttribute(p,idx.getX(0)),b=new T.Vector3().fromBufferAttribute(p,idx.getX(1)),c=new T.Vector3().fromBufferAttribute(p,idx.getX(2));
 assert.ok(b.sub(a).cross(c.sub(a)).z<0);
 for(const name of ['c64 key r0 k0','bbc key r0 k0','sun key r0 k0','COMMODORE 64 nameplate','BBC MODEL B nameplate','SUN SPARCSTATION nameplate']){
  const o=objects.find(o=>o.name===name),i=mesh.userData.editorObjectIds.indexOf(o.id);mesh.getMatrixAt(i,m);
  const center=new T.Vector3().setFromMatrixPosition(m),normal=new T.Vector3(0,0,-1).transformDirection(m),right=new T.Vector3(1,0,0).transformDirection(m),up=new T.Vector3(0,1,0).transformDirection(m);
  assert.ok(right.x>.999);
  if(name.includes('nameplate')){assert.ok(normal.z<-.999);assert.ok(up.y>.999);assert.ok(Math.abs(center.z-(o.position[2]-o.scale[2]/2-.00035))<1e-5);}
  else {assert.ok(normal.y>.999);assert.ok(up.z>.999);assert.ok(Math.abs(center.y-(o.position[1]+o.scale[1]/2+.00035))<1e-5);}
 }
 mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();
});
test('atlas cells have transparent gutters and bounded rectangles',()=>{
 const calls=[],atlas=buildWarehouseLetteringAtlas([{label:'Q',face:'top'},{label:'Q',face:'top'},{label:'COMMODORE 64',face:'front'}],()=>({getContext:()=>({clearRect(...a){calls.push(a);},fillText(...a){calls.push(a);}})}));
 assert.equal(atlas.rects.size,2);assert.deepEqual(calls[0],[0,0,1024,512]);
 for(const [x,y,w,h] of atlas.rects.values()){assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1);}
});

test('parent-hidden physical keys are omitted and scene disposal owns atlas exactly once',()=>{
 const o=objects.find(o=>o.name==='c64 key r0 k0');
 const hiddenProject={...project,objects:objects.map(item=>item.id===o.id?{...item,parentId:'hidden-station'}:item).concat([{id:'hidden-station',name:'hidden group',kind:'group',collision:'none',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:false}])};
 const mesh=buildWarehouseLettering(world,hiddenProject,resolveWorldMatrices(hiddenProject.objects),{createCanvas:canvas});
 assert.ok(!mesh.userData.editorObjectIds.includes(o.id));
 const root=new T.Group();root.add(mesh);const candidate={root};let textureDisposals=0,geometryDisposals=0,materialDisposals=0;
 mesh.material.map.addEventListener('dispose',()=>textureDisposals++);mesh.geometry.addEventListener('dispose',()=>geometryDisposals++);mesh.material.addEventListener('dispose',()=>materialDisposals++);
 disposeWebGLRepositoryScene(candidate);disposeWebGLRepositoryScene(candidate);assert.deepEqual([textureDisposals,geometryDisposals,materialDisposals],[1,1,1]);
});
