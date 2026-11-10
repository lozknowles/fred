import {T,effectiveObjectState} from './vendor/world-engine-contract.js';
import {buildRecipe} from '../world/PortalInteriorRecipe.js';
import {WAREHOUSE_SURFACE_WORLD,WAREHOUSE_RECIPE_SOURCE} from './WarehouseSurfaces.js';

// Wording is the original PortalRetroScreens keyRows. The legacy sheet reversed
// rows to compensate for its mirrored UV; physical caps viewed from -Z use +X right.
const rows=[['1','2','3','4','5','6','7','8','9','0','-','=','DEL'],['Q','W','E','R','T','Y','U','I','O','P','[',']','\\','TAB'],['A','S','D','F','G','H','J','K','L',';','"','RETURN','CTRL'],['SHIFT','Z','X','C','V','B','N','M',',','.','/','SHIFT']];
const recipe=buildRecipe();
const authored=new Map(recipe.objects.map((o,i)=>['warehouse:object:'+String(i).padStart(4,'0'),o]));
export function warehouseLetteringSpec(worldId,asset,object){
 const source=authored.get(object.id);
 if(worldId!==WAREHOUSE_SURFACE_WORLD||!source||object.kind!=='glb'||object.collisionOnly||object.materialOverrides?.length||object.ambientBehaviour||asset?.source!==WAREHOUSE_RECIPE_SOURCE||object.name!==source.name||asset.id!==`warehouse:${source.shape}-${source.material}`)return null;
 const key=/^(c64|bbc|sun) (?:key r(\d) k(\d+)|(space|left shift|return) key|function key (\d+))$/.exec(source.name);
 if(key){const [,machine,r,k,special,f]=key;let label;
  if(r!==undefined)label=rows[Number(r)]?.[Number(k)]??'ESC';
  else if(f!==undefined)label='F'+(Number(f)+1);
  else label=special==='space'?'SPACE':special==='return'?'RETURN':'SHIFT';
  return {label,machine,face:'top',color:machine==='sun'?'#342b46':machine==='c64'?'#efe0bb':'#f4e8cf'};
 }
 if(/^(COMMODORE 64|BBC MODEL B|SUN SPARCSTATION) nameplate$/.test(source.name))return {label:source.name.replace(' nameplate',''),face:'front',color:'#211d18'};
 return null;
}
export function buildWarehouseLetteringAtlas(specs,createCanvas=()=>document.createElement('canvas')){
 const canvas=createCanvas();canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,1024,512);ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
 const rects=new Map(),keys=[...new Set(specs.filter(s=>s.face==='top').map(s=>s.label))],plates=[...new Set(specs.filter(s=>s.face==='front').map(s=>s.label))];
 if(keys.length>80||plates.length>3)throw Error('Warehouse lettering atlas budget exceeded');
 keys.forEach((label,i)=>{const x=i%10*96,y=Math.floor(i/10)*40;ctx.font='bold 28px monospace';ctx.fillText(label,x+48,y+20,80);rects.set(label,[x/1024,1-(y+40)/512,96/1024,40/512]);});
 plates.forEach((label,i)=>{const y=320+i*64;ctx.font='bold 48px monospace';ctx.fillText(label,512,y+32,960);rects.set(label,[0,1-(y+64)/512,1,64/512]);});
 return {canvas,rects};
}
/** One immutable atlas, one instanced draw; no live screen or input resources. */
export function buildWarehouseLettering(worldId,project,matrices,{createCanvas}={}){
 if(worldId!==WAREHOUSE_SURFACE_WORLD)return null;
 const assets=new Map(project.assets.map(a=>[a.id,a])),entries=[];
 for(const object of project.objects){const spec=warehouseLetteringSpec(worldId,assets.get(object.assetId),object);if(spec&&matrices.has(object.id)&&effectiveObjectState(project.objects,object.id).visible)entries.push({object,spec});}
 if(!entries.length)return null;
 const {canvas,rects}=buildWarehouseLetteringAtlas(entries.map(e=>e.spec),createCanvas),texture=new T.CanvasTexture(canvas);
 texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.anisotropy=4;
 // Front winding faces -Z. Rotation +pi/2 around X puts glyph tops toward +Z
 // and normals +Y on the real caps; +X remains the viewer's right on both faces.
 const geometry=new T.PlaneGeometry();geometry.setIndex([0,1,2,2,1,3]);geometry.getAttribute('normal').array.fill(0);for(let i=0;i<4;i++)geometry.getAttribute('normal').setZ(i,-1);
 const uvRects=new Float32Array(entries.length*4);geometry.setAttribute('warehouseGlyphRect',new T.InstancedBufferAttribute(uvRects,4));
 const material=new T.MeshBasicMaterial({map:texture,alphaTest:.12,transparent:false,depthWrite:false,side:T.FrontSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false});
 material.name='warehouse-original-key-and-nameplate-lettering';
 material.onBeforeCompile=shader=>{shader.vertexShader='attribute vec4 warehouseGlyphRect;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vMapUv=warehouseGlyphRect.xy+vMapUv*warehouseGlyphRect.zw;');};
 material.customProgramCacheKey=()=> 'warehouse-lettering/1';
 const mesh=new T.InstancedMesh(geometry,material,entries.length);mesh.name='warehouse-physical-key-and-front-nameplate-lettering';mesh.userData.editorObjectIds=entries.map(e=>e.object.id);
 const local=new T.Matrix4(),translation=new T.Matrix4(),scale=new T.Matrix4();
 entries.forEach(({object,spec},i)=>{
  // Saved recipe boxes are unit cubes. Offsets are relative to their physical
  // face, so parent transforms and edited station poses remain correct.
  const size=new T.Vector3().setFromMatrixScale(matrices.get(object.id));
  const top=spec.face==='top';translation.makeTranslation(0,top?.5+.00035/size.y:0,top?0:-.5-.00035/size.z);
  scale.makeScale(.90,.72,1);
  local.copy(matrices.get(object.id)).multiply(translation);
  // A non-uniform box scale must precede the top-face basis, with dimensions
  // expressed in the original X/Z axes rather than mixing Y and Z scales.
  if(top){const basis=new T.Matrix4().set(.85,0,0,0,0,0,-1,0,0,.72,0,0,0,0,0,1);local.multiply(basis);}else local.multiply(scale);
  mesh.setMatrixAt(i,local);mesh.setColorAt(i,new T.Color(spec.color));uvRects.set(rects.get(spec.label),i*4);
 });
 mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
 mesh.userData.warehouseLettering={instances:entries.length,drawCalls:1,atlas:[1024,512],source:WAREHOUSE_RECIPE_SOURCE};
 return mesh;
}
