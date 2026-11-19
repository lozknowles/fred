import {isCapturedNativeCanopyCollection} from './NativeCanopyCapture.js';
export const NATIVE_CANOPY_INDEX_POLICY=Object.freeze({cellSize:128,maxRecords:200000,maxCells:4096,maxBytes:4*1024*1024,denseFraction:.75});
// Conservative candidates for the existing selection spheres, not geometry or
// occlusion proof bounds. Every retained row still runs the original selector.
export function createNativeCanopyIndex(records){
 if(!isCapturedNativeCanopyCollection(records))return null;
 const started=performance.now(),recordCount=records.length,policy=NATIVE_CANOPY_INDEX_POLICY;
 let bounds=null,offsets=null,ids=null,bits=null,output=null,cells=null,disposed=false;
 const state={records:recordCount,cells:0,retainedBytes:0,constructionMs:0,queries:0,cellsTested:0,cellsRejected:0,candidateRecords:0,lastCandidates:recordCount,denseFallbacks:0,invalidFallbacks:0,reason:null};
 const fallback=reason=>{state.reason=reason;state.lastCandidates=recordCount;state.candidateRecords+=recordCount;if(reason==='dense')state.denseFallbacks++;else state.invalidFallbacks++;return null;};
 const finish=reason=>{cells?.clear();cells=null;state.reason=reason;state.constructionMs=performance.now()-started;return api;};
 const api={query(frustum){
  state.queries++;
  if(disposed||!output)return fallback(disposed?'disposed':state.reason??'unavailable');
  const planes=frustum?.planes;if(planes?.length!==6)return fallback('invalid-frustum');
  for(const p of planes)if(![p.normal?.x,p.normal?.y,p.normal?.z,p.constant].every(Number.isFinite))return fallback('invalid-frustum');
  bits.fill(0);let count=0;
  for(let cell=0;cell<state.cells;cell++){
   state.cellsTested++;let rejected=false;
   for(const p of planes){
    const n=p.normal,k=cell*6,x=n.x>=0?bounds[k+3]:bounds[k],y=n.y>=0?bounds[k+4]:bounds[k+1],z=n.z>=0?bounds[k+5]:bounds[k+2];
    const px=n.x*x,py=n.y*y,pz=n.z*z,distance=px+py+pz+p.constant,margin=1e-7+128*Number.EPSILON*(Math.abs(px)+Math.abs(py)+Math.abs(pz)+Math.abs(p.constant));
    if(!Number.isFinite(distance)||!Number.isFinite(margin))return fallback('uncertain-frustum');
    if(distance< -margin){rejected=true;break;}
   }
   if(rejected){state.cellsRejected++;continue;}
   count+=offsets[cell+1]-offsets[cell];
   if(recordCount&&count>=recordCount*policy.denseFraction)return fallback('dense');
   for(let j=offsets[cell];j<offsets[cell+1];j++){const id=ids[j];bits[id>>>5]|=1<<(id&31);}
  }
  let cursor=0;
  for(let i=0;i<bits.length;i++){let word=bits[i];while(word){const bit=31-Math.clz32(word&-word);output.ids[cursor++]=(i<<5)+bit;word=(word&(word-1))>>>0;}}
  output.count=cursor;state.lastCandidates=cursor;state.candidateRecords+=cursor;state.reason='ready';return output;
 },stats:()=>({...state,disposed,policy}),dispose(){disposed=true;bounds=offsets=ids=bits=null;if(output)output.ids=null;output=null;state.retainedBytes=0;state.reason='disposed';}};
 if(recordCount>policy.maxRecords)return finish('record-limit');
 cells=new Map();
 for(let i=0;i<recordCount;i++){
  const r=records[i];
  // Captured default data is scalar. Explicit capture adapters with boxed or
  // otherwise mutable values must not gain a stable spatial bound by coercion.
  if(!Number.isFinite(r.x)||!Number.isFinite(r.y)||!Number.isFinite(r.z)||!Number.isFinite(r.s)||(r.H!=null&&!Number.isFinite(r.H)))return finish('invalid-record');
  const x=r.x,y=r.y+(r.H??5)*.5,z=r.z,radius=Math.max(4,r.H??0)*r.s+4,cx=Math.floor(x/policy.cellSize),cz=Math.floor(z/policy.cellSize);
  if(![x,y,z,radius].every(Number.isFinite)||radius<0||!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))return finish('invalid-record');
  const key=cx+':'+cz;let cell=cells.get(key);if(!cell){if(cells.size>=policy.maxCells)return finish('cell-limit');cells.set(key,cell={ids:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});}
  cell.ids.push(i);const c=[x,y,z];for(let k=0;k<3;k++){cell.min[k]=Math.min(cell.min[k],c[k]-radius);cell.max[k]=Math.max(cell.max[k],c[k]+radius);}
 }
 state.cells=cells.size;
 const bytes=state.cells*6*8+(state.cells+1)*4+recordCount*4+Math.ceil(recordCount/32)*4+recordCount*4;
 if(bytes>policy.maxBytes)return finish('byte-limit');
 bounds=new Float64Array(state.cells*6);offsets=new Uint32Array(state.cells+1);ids=new Uint32Array(recordCount);bits=new Uint32Array(Math.ceil(recordCount/32));output={ids:new Uint32Array(recordCount),count:0};
 let cellIndex=0,cursor=0;
 for(const cell of cells.values()){
  const margin=1e-7+128*Number.EPSILON*Math.max(1,...cell.min.map(Math.abs),...cell.max.map(Math.abs));
  for(let k=0;k<3;k++){const lo=cell.min[k]-margin,hi=cell.max[k]+margin;if(!Number.isFinite(lo)||!Number.isFinite(hi)){api.dispose();disposed=false;return finish('uncertain-bound');}bounds[cellIndex*6+k]=lo;bounds[cellIndex*6+k+3]=hi;}
  offsets[cellIndex++]=cursor;ids.set(cell.ids,cursor);cursor+=cell.ids.length;
 }
 offsets[state.cells]=cursor;state.retainedBytes=bytes;return finish('ready');
}
