import {inspectGlbJson,repositoryDigest,inspectAndLoadAsset,disposeAssetScene} from './vendor/world-engine-contract.js';

const MAX_BYTES=6*1024*1024;
const MAX_TIER_BYTES=24*1024*1024;
export function textureTierReferences(asset){
 if(asset.textureTiers===undefined)return [];
 if(!Array.isArray(asset.textureTiers)||asset.textureTiers.length>3)throw Error('Invalid texture tier count');
 let distance=Infinity,bytes=asset.bytes;
 return asset.textureTiers.map(ref=>{
  if(!ref||Object.keys(ref).some(k=>!['path','sha256','bytes','distance'].includes(k))||!/^[a-f0-9]{64}$/.test(ref.sha256??'')||ref.path!==`assets/${ref.sha256}.glb`||!Number.isSafeInteger(ref.bytes)||ref.bytes<=bytes||ref.bytes>MAX_BYTES||!Number.isFinite(ref.distance)||ref.distance<=0||ref.distance>=distance||ref.distance>2000)throw Error('Invalid pinned texture tier reference');
  distance=ref.distance;bytes=ref.bytes;return {...ref};
 });
}
function document(bytes){
 const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);inspectGlbJson(buffer);
 const view=new DataView(buffer),length=view.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length))),bin=new Uint8Array(buffer,28+length);
 return {json,bin};
}
/** All scene/material/sampler/UV and non-image bytes remain identical. */
export function assertTextureTierCompatible(coarse,fine){
 const a=document(coarse),b=document(fine);
 if(!a.json.images?.length)throw Error('Texture tiers require embedded images');
 const normalize=({json,bin})=>{
  const images=new Set(json.images.map(image=>image.bufferView));
  if(json.accessors.some(accessor=>images.has(accessor.bufferView)))throw Error('Texture tier image aliases geometry');
  for(const i of images){
   const image=json.bufferViews[i],start=image.byteOffset??0,end=start+image.byteLength;
   if(json.bufferViews.some((v,j)=>!images.has(j)&&Math.max(start,v.byteOffset??0)<Math.min(end,(v.byteOffset??0)+v.byteLength)))throw Error('Texture tier image overlaps geometry');
  }
  const payloads=json.bufferViews.map((v,i)=>images.has(i)?null:bin.slice(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));
  json.buffers[0].byteLength=0;
  for(const i of images){json.bufferViews[i].byteOffset=0;json.bufferViews[i].byteLength=0;}
  return {json:JSON.stringify(json),payloads};
 };
 const x=normalize(a),y=normalize(b);
 if(x.json!==y.json||x.payloads.some((p,i)=>p&&(p.length!==y.payloads[i]?.length||p.some((v,j)=>v!==y.payloads[i][j]))))throw Error('Texture tier changes geometry or material semantics');
}
export async function readVerifiedTextureTier(read,ref,coarse,signal){
 const bytes=new Uint8Array(await read(ref.path,ref.bytes,{signal}));
 if(signal?.aborted)throw signal.reason;
 if(bytes.byteLength!==ref.bytes||await repositoryDigest(bytes)!==ref.sha256)throw Error('Texture tier hash or size mismatch');
 assertTextureTierCompatible(coarse,bytes);return bytes;
}
/** Used by packaging: return the exact authenticated bytes to write. */
export async function collectVerifiedRepositoryTextureTiers(project,read){
 const files=new Map();let planned=0;
 for(const asset of project.assets){
  const refs=textureTierReferences(asset);planned+=refs.reduce((sum,ref)=>sum+ref.bytes,0);
  if(planned>MAX_TIER_BYTES)throw Error('Texture tier candidate byte budget exceeded');
  if(!refs.length)continue;
  const coarse=Uint8Array.from(atob(asset.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
  for(const ref of refs)files.set(ref.path,await readVerifiedTextureTier(read,ref,coarse));
 }
 return files;
}
function promoteTextures(current,next){
 const bySlot=new Map([...next.materialIndices].map(([material,index])=>[index,material]));
 for(const [material,index]of current.materialIndices){
  const source=bySlot.get(index);if(!source)throw Error('Texture tier material slot missing');
  for(const key of Object.keys(material))if(material[key]?.isTexture){
   if(!source[key]?.isTexture)throw Error('Texture tier texture slot missing');
   // Preserve the original texture identity: clones share it, and its sampler,
   // colour space, UV transform and normal-map conventions remain untouched.
   material[key].image=source[key].image;material[key].needsUpdate=true;
  }
 }
}
/** A candidate owns one in-flight promotion, shared by all instances of an asset. */
export function createRepositoryTextureTiers({read,parse=inspectAndLoadAsset,dispose=disposeAssetScene,onLoaded=()=>{}}={}){
 const records=new Map(),controller=new AbortController();let disposed=false,busy=false,plannedBytes=0,pending=Promise.resolve();
 const stats={eligible:0,requests:0,verifiedBytes:0,promotions:0,failures:0};
 return {stats,
  register(asset,bytes,loaded,positions){
   const refs=textureTierReferences(asset);if(!refs.length||!read)return;
   let record=records.get(asset.id);if(!record){plannedBytes+=refs.reduce((sum,ref)=>sum+ref.bytes,0);if(plannedBytes>MAX_TIER_BYTES)throw Error('Texture tier candidate byte budget exceeded');record={refs,bytes,loaded,positions:[],level:0,failed:false};records.set(asset.id,record);stats.eligible++;}
   record.positions.push(...positions);
  },
  update(camera){
   if(disposed||busy||!camera?.position)return;
   const p=camera.position;
   for(const r of records.values()){
    const ref=r.refs[r.level];if(!ref||r.failed||!r.positions.some(q=>Math.hypot(p.x-q[0],p.y-q[1],p.z-q[2])<=ref.distance))continue;
    busy=true;stats.requests++;
    pending=(async()=>{
     let loaded;
     try{
      const bytes=await readVerifiedTextureTier(read,ref,r.bytes,controller.signal);stats.verifiedBytes+=bytes.length;
      loaded=await parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
      if(disposed){dispose(loaded.scene);return;}
      promoteTextures(r.loaded,loaded);onLoaded(loaded);loaded=null;r.level++;stats.promotions++;
     }catch(error){if(loaded)dispose(loaded.scene);if(!disposed){r.failed=true;stats.failures++;r.error=error.message;}}
     finally{busy=false;}
    })();break;
   }
  },
  whenIdle(){return pending;},
  dispose(){if(disposed)return;disposed=true;controller.abort(new DOMException('World disposed','AbortError'));records.clear();}
 };
}
