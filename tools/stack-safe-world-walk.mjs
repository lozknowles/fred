import {createHash} from 'node:crypto';
// Local build adaptation of the pinned contract. No validation is removed:
// push entries one at a time, in exactly the original order. A wide terrain
// array must not become a single JS call with tens of thousands of arguments.
const before='if (Array.isArray(current)) pending.push(...current);';
const after='if (Array.isArray(current)) { for (const element of current) pending.push(element); }';
export function stackSafeWorldWalk(){
 return {name:'stack-safe-world-field-walk',enforce:'pre',transform(source,id){
  if(!id.replaceAll('\\\\','/').endsWith('/src/world-runtime/vendor/world-engine-contract.js'))return;
  if(createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex')!=='633a828536b774c71c2f0feae31f262fef387233afad1c2fa2e90b624288d42a')throw Error('Review world validator adaptation after contract change');
  const start=source.indexOf('function rejectExecutableFields(value) {');
  const end=source.indexOf('\n}',start);
  if(start<0||end<0||source.slice(start,end).split(before).length!==2||source.split(before).length!==2)throw Error('Review world validator adaptation after contract change');
  return {code:source.replace(before,after),map:null};
 }};
}
