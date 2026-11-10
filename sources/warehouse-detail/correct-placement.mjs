// Run after integrate.mjs: source-front conventions verified from actual meshes.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(root,'world.json'))),values={},bytes={};
for(const [role,ref]of Object.entries(manifest.components)){bytes[role]=fs.readFileSync(path.join(root,ref.path));values[role]=JSON.parse(bytes[role]);}
const report=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'report.json'))),corrections=[];
function change(id,fn){const o=values.objects.find(o=>o.id==='warehouse:detail:'+id);if(!o)throw Error('Missing '+id);const before=structuredClone(o);fn(o);corrections.push({id:o.id,before,after:structuredClone(o)});}
change('chaise',o=>{o.rotation=[0,Math.PI,0];});
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
bytes.objects=json(values.objects);const refs=Object.fromEntries(Object.entries(bytes).map(([role,b])=>[role,{sha256:sha(b),bytes:b.length}])),snapshot=sha(json(refs));for(const [role,b]of Object.entries(bytes)){const relative=`snapshots/${snapshot}/${role}.json`;fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),b);manifest.components[role]={path:relative,...refs[role]};}manifest.snapshot=snapshot;manifest.regions[0].scene.snapshot=snapshot;fs.writeFileSync(path.join(root,'world.json'),json(manifest));report.snapshot=snapshot;report.contentDigest=sha(json(manifest));report.added=values.objects.filter(o=>o.id.startsWith('warehouse:detail:'));fs.writeFileSync(path.join(import.meta.dirname,'report.json'),json(report));fs.writeFileSync(path.join(import.meta.dirname,'placement-correction.json'),json({snapshot,contentDigest:report.contentDigest,sourceFront:'+Z for source chaise/appliance models; yaw PI gives room-facing -Z',support:{worktopTop:3.95,sideTableTop:3.70},corrections}));console.log(JSON.stringify({snapshot,contentDigest:report.contentDigest},null,2));
