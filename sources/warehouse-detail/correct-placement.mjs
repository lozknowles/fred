// Run after integrate.mjs: source-front conventions verified from actual meshes.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(root,'world.json'))),values={},bytes={};
for(const [role,ref]of Object.entries(manifest.components)){bytes[role]=fs.readFileSync(path.join(root,ref.path));values[role]=JSON.parse(bytes[role]);}
const report=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'report.json'))),corrections=[];
function change(id,fn){const o=values.objects.find(o=>o.id==='warehouse:detail:'+id);if(!o)throw Error('Missing '+id);const before=structuredClone(o);fn(o);corrections.push({id:o.id,before,after:structuredClone(o)});}
change('chaise',o=>{o.rotation=[0,Math.PI,0];});
// Retain the old return collider exactly, but replace its primitive upholstery
// with a second instance of the resident chaise (no new asset or materials).
for(const n of [530,531,532,533,540]){const o=values.objects.find(o=>o.id===`warehouse:object:${String(n).padStart(4,'0')}`);if(!report.changes.some(c=>c.id===o.id))report.changes.push({id:o.id,before:structuredClone(o)});if(n===530&&!o.collisionOnly){o.kind='box';delete o.assetId;o.collisionOnly=true;o.scale=o.scale.map(s=>s/1.6);}else if(n!==530)o.visible=false;}
const sourceBounds=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'blend-report.json'))).chaise.sourceBounds,sourceSize=sourceBounds[1].map((v,i)=>v-sourceBounds[0][i]);
if(!values.objects.some(o=>o.id==='warehouse:detail:chaise-return')){const o=structuredClone(values.objects.find(o=>o.id==='warehouse:detail:chaise'));o.id='warehouse:detail:chaise-return';o.name='BlenderKit source-proportioned lounge return chaise';values.objects.push(o);}
change('chaise-return',o=>{o.scale=[2.5,2.5*sourceSize[2]/sourceSize[0],2.5*sourceSize[1]/sourceSize[0]];o.rotation=[0,Math.PI/2,0];o.position=[-11.05,0,-75.85];});
// Read actual bottom-contact vertices and test their transformed XZ positions
// against the two rotated rug rectangles; the layer's 3.0825 top matters.
const supportProof=[];
for(const id of ['chaise','ottoman','chaise-return']){const o=values.objects.find(o=>o.id==='warehouse:detail:'+id),a=values.assets.find(a=>a.id===o.assetId),b=fs.readFileSync(path.join(root,a.file.path)),g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12))),bin=b.subarray(28+b.readUInt32LE(12)),hits=new Map();let contacts=0;
 for(const mesh of g.meshes)for(const p of mesh.primitives){const ac=g.accessors[p.attributes.POSITION],v=g.bufferViews[ac.bufferView];for(let i=0;i<ac.count;i++){const at=(v.byteOffset??0)+(ac.byteOffset??0)+i*(v.byteStride??12),y=bin.readFloatLE(at+4);if(y>-.49)continue;contacts++;const x=bin.readFloatLE(at)*o.scale[0],z=bin.readFloatLE(at+8)*o.scale[2],yaw=o.rotation[1],wx=o.position[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,wz=o.position[2]-Math.sin(yaw)*x+Math.cos(yaw)*z;
 for(const n of [518,519]){const rug=values.objects.find(o=>o.id===`warehouse:object:0${n}`),dx=wx-rug.position[0],dz=wz-rug.position[2],r=rug.rotation[1],rx=Math.cos(r)*dx-Math.sin(r)*dz,rz=Math.sin(r)*dx+Math.cos(r)*dz;const ra=values.assets.find(a=>a.id===rug.assetId),bounds=ra.bounds;if(rx>=bounds.min[0]*rug.scale[0]&&rx<=bounds.max[0]*rug.scale[0]&&rz>=bounds.min[2]*rug.scale[2]&&rz<=bounds.max[2]*rug.scale[2])hits.set(rug.id,{id:rug.id,assetId:ra.id,assetSHA256:ra.file.sha256,assetBounds:bounds,position:rug.position,scale:rug.scale,rotation:rug.rotation,top:rubTop(rug),contactVertices:(hits.get(rug.id)?.contactVertices??0)+1});}}
 }
 const bottom=Math.max(...[...hits.values()].map(h=>h.top));if(!Number.isFinite(bottom))throw Error('No supporting rug '+id);change(id,o=>{o.position[1]=bottom-a.bounds.min[1]*o.scale[1];});supportProof.push({id:o.id,contactBandLocalY:[-.5,-.49],contactVertices:contacts,rugs:[...hits.values()],bottom,position:o.position,scale:o.scale,rotation:o.rotation});
}
function rubTop(rug){return rug.position[1]+values.assets.find(a=>a.id===rug.assetId).bounds.max[1]*rug.scale[1];}
// Each Kenney model has a corner origin; center its rotated bounds before placement.
function fit(id,center,bottom,width,depth,height){const o=values.objects.find(o=>o.id==='warehouse:detail:'+id),a=values.assets.find(a=>a.id===o.assetId),size=a.bounds.max.map((v,i)=>v-a.bounds.min[i]),mid=a.bounds.max.map((v,i)=>(v+a.bounds.min[i])/2),s=width/size[0];change(id,o=>{o.scale=[s,height?height/size[1]:s,depth?depth/size[2]:s];o.rotation=[0,Math.PI,0];o.position=[center[0]+mid[0]*o.scale[0],bottom-a.bounds.min[1]*o.scale[1],center[1]+mid[2]*o.scale[2]];});}
// Door/handle nodes occupy source +Z (door z[-.04,0]); yaw PI makes the door face -Z.
fit('kitchenstove',[8.45,-72.20],3.34,1.42,.68,1.52);
fit('toaster',[2.30,-75.10],3.95,.30);
fit('kitchencoffeemachine',[3.95,-75.10],3.95,.35);
fit('kitchenblender',[7.70,-75.10],3.95,.18);
change('lantern',o=>{const a=values.assets.find(a=>a.id===o.assetId);o.position[1]=3.70-a.bounds.min[1]*o.scale[1];});
// The scanned chopping board sits on the same measured top; the knife rests on its upper bound.
let boardTop;change('cutting-board',o=>{const a=values.assets.find(a=>a.id===o.assetId);o.position[1]=3.95-a.bounds.min[1]*o.scale[1];boardTop=o.position[1]+a.bounds.max[1]*o.scale[1];});
change('knife',o=>{const a=values.assets.find(a=>a.id===o.assetId);o.position[1]=boardTop-a.bounds.min[1]*o.scale[1];});
bytes.objects=json(values.objects);const refs=Object.fromEntries(Object.entries(bytes).map(([role,b])=>[role,{sha256:sha(b),bytes:b.length}])),snapshot=sha(json(refs));for(const [role,b]of Object.entries(bytes)){const relative=`snapshots/${snapshot}/${role}.json`;fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),b);manifest.components[role]={path:relative,...refs[role]};}manifest.snapshot=snapshot;manifest.regions[0].scene.snapshot=snapshot;fs.writeFileSync(path.join(root,'world.json'),json(manifest));report.snapshot=snapshot;report.contentDigest=sha(json(manifest));report.added=values.objects.filter(o=>o.id.startsWith('warehouse:detail:'));fs.writeFileSync(path.join(import.meta.dirname,'report.json'),json(report));fs.writeFileSync(path.join(import.meta.dirname,'placement-correction.json'),json({snapshot,contentDigest:report.contentDigest,sourceFront:'+Z for chaise/appliances; chaise yaw PI gives world -Z, return yaw PI/2 gives world +X',support:{worktopTop:3.95,sideTableTop:3.70,lounge:supportProof},returnFit:{sourceBounds,sourceSize,length:2.5,centerOffsetZ:-.25,longChaiseAabbMinZ:-74.55,returnAabbMaxZ:-74.60,gap:.05,unchangedColliderIds:['warehouse:object:0521','warehouse:object:0530']},corrections}));console.log(JSON.stringify({snapshot,contentDigest:report.contentDigest},null,2));
