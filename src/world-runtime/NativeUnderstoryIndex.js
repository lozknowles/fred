const ascending=(a,b)=>a-b;

// Conservative candidates only. The caller retains its original Math.hypot,
// frustum test, pose construction and upload. IDs are sorted into source order.
// Captured source records are immutable for the lifetime of a native island.
export function createNativeUnderstoryIndex(records,radius){
 if(records.length<256||!Number.isFinite(radius)||radius<=0||radius>140)return null;
 const columns=new Map(),ids=[];
 for(let i=0;i<records.length;i++){
  const r=records[i],x=Math.floor(r.x/radius),z=Math.floor(r.z/radius);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(z))return null;
  let column=columns.get(x);if(!column)columns.set(x,column=new Map());
  let bucket=column.get(z);if(!bucket)column.set(z,bucket=[]);bucket.push(i);
 }
 return{query(x,z){
  // Expand by a few ulps so rounded distance comparisons at a cell boundary
  // remain the caller's decision. Invalid camera coordinates use the old scan.
  const pad=Number.EPSILON*Math.max(1,Math.abs(x),Math.abs(z),radius)*4;
  const x0=Math.floor((x-radius-pad)/radius),x1=Math.floor((x+radius+pad)/radius),z0=Math.floor((z-radius-pad)/radius),z1=Math.floor((z+radius+pad)/radius);
  if(!Number.isSafeInteger(x0)||!Number.isSafeInteger(x1)||!Number.isSafeInteger(z0)||!Number.isSafeInteger(z1))return null;
  ids.length=0;
  for(let cx=x0;cx<=x1;cx++){
   const column=columns.get(cx);if(!column)continue;
   for(let cz=z0;cz<=z1;cz++){const bucket=column.get(cz);if(bucket)for(let i=0;i<bucket.length;i++)ids.push(bucket[i]);}
  }
  ids.sort(ascending);return ids;
 }};
}
