// Only the dedicated, one-package admission worker instantiates this cache.
// Encoded strings are immutable; neither asset IDs nor declared hashes prove equality.
export function createPublishedGlbInspector(inspect,{maxEntries=128,maxChars=4*Math.ceil(15*1024*1024/3)+256}={}){
 const facts=new Map();let retained=0;
 return encoded=>{
  if(facts.has(encoded))return facts.get(encoded);
  // Keep atob's exact acceptance rules. Avoid making an array of millions of
  // single-character strings before copying the decoded bytes into a buffer.
  const binary=atob(encoded),bytes=new Uint8Array(binary.length);
  for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);
  const {bounds,materialCount}=inspect(bytes.buffer);
  const result=Object.freeze({materialCount,bounds:Object.freeze({min:Object.freeze([...bounds.min]),max:Object.freeze([...bounds.max])})});
  // Keep only successful derived facts, not decoded buffers or scene graphs.
  if(facts.size<maxEntries&&retained+encoded.length<=maxChars){facts.set(encoded,result);retained+=encoded.length;}
  return result;
 };
}
