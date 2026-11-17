import {createHash} from 'node:crypto';
// Local build adaptation of the pinned contract. No validation is removed:
// push entries one at a time, in exactly the original order. A wide terrain
// array must not become a single JS call with tens of thousands of arguments.
const before='if (Array.isArray(current)) pending.push(...current);';
const after='if (Array.isArray(current)) { for (const element of current) pending.push(element); }';
// Both call sites only consume bounds/materialCount. Keep validation of each
// asset's own metadata and all repository-byte/digest checks in the contract.
const inspections=[
 ['const binary = atob(encoded);\n          const result = inspectGlbJson(Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer);','const result = inspectPublishedGlb(encoded);'],
 ['const binary = atob(asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1));\n      b = inspectGlbJson(Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer).bounds;','b = inspectPublishedGlb(asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1)).bounds;']
];
export function stackSafeWorldWalk(){
 return {name:'stack-safe-world-field-walk',enforce:'pre',transform(source,id){
  if(!id.replaceAll('\\\\','/').endsWith('/src/world-runtime/vendor/world-engine-contract.js'))return;
  if(createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex')!=='633a828536b774c71c2f0feae31f262fef387233afad1c2fa2e90b624288d42a')throw Error('Review world validator adaptation after contract change');
  const start=source.indexOf('function rejectExecutableFields(value) {');
  const end=source.indexOf('\n}',start);
  if(start<0||end<0||source.slice(start,end).split(before).length!==2||source.split(before).length!==2)throw Error('Review world validator adaptation after contract change');
  let code=source.replaceAll('\r\n','\n').replace(before,after);
  for(const [from,to] of inspections){
   if(code.split(from).length!==2)throw Error('Review pinned published GLB inspection sites');
   code=code.replace(from,to);
  }
  return {code:"import {createPublishedGlbInspector} from '../PublishedGlbInspection.js';\nconst inspectPublishedGlb=createPublishedGlbInspector(inspectGlbJson);\n"+code,map:null};
 }};
}
