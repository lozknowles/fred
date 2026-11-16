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
