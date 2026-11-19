// Only explicitly captured, privately copied collections can authorize an index.
// Never freeze resource-reader-owned objects or infer ownership from their shape.
const captured=new WeakSet();
export function captureNativeCanopyCollections(records){
 const result={...records};
 for(const species of ['trees','shrubs']){
  const rows=records[species].map(record=>Object.freeze({...record}));
  Object.freeze(rows);captured.add(rows);result[species]=rows;
 }
 return result;
}
export const isCapturedNativeCanopyCollection=rows=>captured.has(rows);
export function filterNativeCanopyCollection(rows,predicate){
 const filtered=rows.filter(predicate);
 if(captured.has(rows)){Object.freeze(filtered);captured.add(filtered);}
 return filtered;
}
