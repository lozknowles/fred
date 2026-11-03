// Rebuild immutable snapshot from aa50df's active components. Run once on that base.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..'),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'world.json'))),values={},bytes={};
for(const [role,ref]of Object.entries(manifest.components)){bytes[role]=fs.readFileSync(path.join(root,ref.path));values[role]=JSON.parse(bytes[role]);}
const tiers=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'tiers.json'))),coarse=tiers.tiers[0],fine=tiers.tiers[1],asset=structuredClone(values.assets.find(a=>a.id==='warehouse:box-graffitiCream'));
asset.id='warehouse:architectural-print-tiers';asset.name='Warehouse architectural study, original muted print';asset.bytes=coarse.bytes;asset.file={path:coarse.path,sha256:coarse.sha256,bytes:coarse.bytes};asset.textureTiers=[{path:fine.path,sha256:fine.sha256,bytes:fine.bytes,distance:8}];
asset.source+='; original procedural architectural print, sources/warehouse-print/generate.mjs SHA256 '+sha(fs.readFileSync(path.join(import.meta.dirname,'generate.mjs')))+'; no external imagery; coarse 32x48 exact area-average of original fine 768x1152; nonimage GLB payload SHA256 '+tiers.nonImageSHA256;
asset.license+='; original print and generator MIT, Copyright (c) 2026 Lawrence Knight';asset.materialSlots[0].color='#ffffff';
const engine=path.resolve(process.argv[2]??path.join(root,'../post-review/engine'));
const {textureTierReferences}=await import(pathToFileURL(path.join(engine,'src/world-runtime/RepositoryTextureTiers.js')));
textureTierReferences(asset); // Reject malformed authored metadata before compiling immutable components.
values.assets.push(asset);const object=values.objects.find(o=>o.id==='warehouse:object:1338');object.assetId=asset.id;object.color='#ffffff';
for(const role of ['objects','assets'])bytes[role]=json(values[role]);
const refs=Object.fromEntries(Object.entries(bytes).map(([role,b])=>[role,{sha256:sha(b),bytes:b.length}])),snapshot=sha(json(refs));
for(const [role,b]of Object.entries(bytes)){const relative=`snapshots/${snapshot}/${role}.json`;fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),b);manifest.components[role]={path:relative,...refs[role]};}
manifest.snapshot=snapshot;manifest.regions[0].scene.snapshot=snapshot;fs.writeFileSync(path.join(root,'world.json'),json(manifest));console.log(JSON.stringify({snapshot,contentDigest:sha(json(manifest)),asset},null,2));
