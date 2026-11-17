import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stackSafeWorldWalk} from '../tools/stack-safe-world-walk.mjs';
test('pinned field validator visits the end of wide arrays and still rejects a forbidden descendant',()=>{
 const id=new URL('../src/world-runtime/vendor/world-engine-contract.js',import.meta.url).pathname;
 const raw=readFileSync(id,'utf8'),t=stackSafeWorldWalk(),compiled=t.transform(raw,id).code;
 const start=compiled.indexOf('function rejectExecutableFields(value) {'),end=compiled.indexOf('\n}',start)+2;
 const f=runInNewContext('const object2=v=>v&&typeof v==="object"&&!Array.isArray(v);'+compiled.slice(start,end)+'; rejectExecutableFields;');
 const array=Array(200000).fill(0);assert.doesNotThrow(()=>f({heights:array}));array[0]={safe:[{HOOKS:[]}]};assert.throws(()=>f({heights:array}),/Executable/);array[0]=0;array.push({onload:1});assert.throws(()=>f(array),/Executable/);assert.throws(()=>t.transform('function rejectExecutableFields(value) {}',id),/Review/);
});
import {createPublishedGlbInspector} from '../src/world-runtime/PublishedGlbInspection.js';
test('GLB facts use exact content, cannot be mutated, never cache failures and respect entry/character limits',()=>{
 let calls=0;const inspect=b=>{calls++;const x=new Uint8Array(b);if(x[0]===0)throw Error('invalid');return {materialCount:x[0],bounds:{min:[0,0,0],max:[1,2,x[0]]}};};
 for(const limits of [{maxChars:4},{maxEntries:1}]){
  calls=0;const f=createPublishedGlbInspector(inspect,limits);
  const a=f('AQ==');assert.equal(f('AQ=='),a);assert.equal(calls,1);assert.throws(()=>{a.bounds.max[2]=9},TypeError);
  assert.equal(f('Ag==').materialCount,2);f('Ag==');assert.equal(calls,3);
  assert.throws(()=>f('AA=='),/invalid/);assert.throws(()=>f('AA=='),/invalid/);assert.equal(calls,5);
  assert.equal(createPublishedGlbInspector(inspect)('AQ==').bounds.max[2],1);assert.equal(calls,6);
 }
});
function triangle(){
 const bin=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer);
 const desc={asset:{version:'2.0'},buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,count:3,type:'VEC3',componentType:5126}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}]};
 let json=JSON.stringify(desc);json+=' '.repeat((4-json.length%4)%4);
 const bytes=Buffer.alloc(28+json.length+bin.length);[0x46546c67,2,bytes.length,json.length,0x4e4f534a].forEach((v,i)=>bytes.writeUInt32LE(v,4*i));bytes.write(json,20);
 bytes.writeUInt32LE(bin.length,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);bin.copy(bytes,28+json.length);return bytes;
}
test('transformed worker and original contract agree on valid GLB, altered bytes and false metadata after a hit',async()=>{
 const url=new URL('../src/world-runtime/vendor/world-engine-contract.js',import.meta.url),ref=await import(url),raw=readFileSync(url,'utf8');
 const source=stackSafeWorldWalk().transform(raw,url.pathname).code.replace("'../PublishedGlbInspection.js'",JSON.stringify(new URL('../src/world-runtime/PublishedGlbInspection.js',import.meta.url).href));
 const worker=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const bytes=triangle(),prefix='data:application/octet-stream;base64,',asset={id:'test-triangle',name:'triangle',bytes:bytes.length,mediaType:'model/gltf-binary',dataUrl:prefix+bytes.toString('base64')};
 const project=ref.createWorld('GLB equality');project.assets=[asset];const same=(w,valid)=>{const a=ref.validateWorld(w),b=worker.validateWorld(w);assert.equal(a.valid,valid,a.errors.join('; '));assert.equal(b.valid,a.valid);assert.deepEqual(b.errors,a.errors);};
 same(project,true);same(structuredClone(project),true);
 for(const metadata of [{bounds:{min:[0,0,0],max:[9,9,9]}},{materialCount:3},{bytes:1},{mediaType:'image/png'}])same({...project,assets:[{...asset,...metadata}]},false);
 const corrupt=Buffer.from(bytes);corrupt.writeFloatLE(NaN,corrupt.length-4);same({...project,assets:[{...asset,dataUrl:prefix+corrupt.toString('base64')}]},false);same(project,true);
});
