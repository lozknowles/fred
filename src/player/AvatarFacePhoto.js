// Private, local appearance only. Never add this payload to AvatarAppearance or
// PlayerProtocol. UV baking keeps the photograph attached to the original skin,
// including facial bones, without introducing a second mesh or changing rigs.
export const FACE_PROFILES=Object.freeze({
 'stock-player':Object.freeze({x:.078,y:1.657,h:.113,z:.065}),
 'stock-female':Object.freeze({x:.068,y:1.582,h:.099,z:0}),
});
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function faceProjection(asset,x,y,z,nz,headWeight=1){
 const p=FACE_PROFILES[asset];if(!p)throw Error('Unsupported local face model');
 const u=.5+x/(p.x*2),v=.5-(y-p.y)/(p.h*2),r=Math.hypot((u-.5)*2,(v-.5)*2);
 return {u,v,alpha:(1-smooth(.76,1,r))*smooth(.12,.65,nz)*smooth(p.z,p.z+.025,z)*smooth(.45,.9,headWeight)};
}
export function facePhotoPixels(image){
 if(image?.data&&Number.isInteger(image.width)&&Number.isInteger(image.height)&&image.data.length===image.width*image.height*4)return image;
 const width=image?.width??image?.naturalWidth,height=image?.height??image?.naturalHeight;
 if(!width||!height)throw Error('A decoded face image is required');
 const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(256,256):Object.assign(document.createElement('canvas'),{width:256,height:256});
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,256,256);return ctx.getImageData(0,0,256,256);
}
/** Rasterize the installed head atlas, using bind-pose front projection only.
 * UV row zero is glTF v=0 (Three flipY=false, native unflipped byte upload).
 * Other materials, back of head, neck, ears, hair and eye interiors stay original.
 * Runtime additionally checks the authored skin zone, so scalp hair is untouched.
 */
export function bakeFacePhoto(source,asset,photo,size=512){
 if(!FACE_PROFILES[asset])throw Error('Unsupported local face model');
 if(!Number.isInteger(size)||size<16||size>1024)throw Error('Invalid face atlas size');
 const rgba=facePhotoPixels(photo),data=new Uint8Array(size*size*4),head=new Set();
 const headNode=source.nodes.findIndex(n=>n.name==='Bip01 Head');if(headNode<0)throw Error('Missing installed head bone');
 const add=i=>{head.add(i);for(const child of source.nodes[i].children)add(child);};add(headNode);
 const joints=source.skins[0].joints,weightScale=a=>a.normalized?(a.array instanceof Uint8Array?1/255:1/65535):1;
 let triangles=0;
 for(const primitive of source.meshes.flat()){
  if(source.materials[primitive.material]?.name!=='head')continue;
  const a=primitive.attributes,p=a.POSITION.array,n=a.NORMAL.array,uv=a.TEXCOORD_0.array,j=a.JOINTS_0.array,w=a.WEIGHTS_0.array,ws=weightScale(a.WEIGHTS_0);
  const idx=primitive.indices??Uint32Array.from({length:p.length/3},(_,i)=>i);
  for(let t=0;t<idx.length;t+=3){
   const ids=[idx[t],idx[t+1],idx[t+2]],points=ids.map(i=>({x:uv[i*2]*size,y:uv[i*2+1]*size}));
   const [A,B,C]=points,den=(B.y-C.y)*(A.x-C.x)+(C.x-B.x)*(A.y-C.y);if(Math.abs(den)<1e-7)continue;
   // Skip triangles outside the facial envelope before rasterizing the atlas.
   if(ids.every(i=>faceProjection(asset,p[i*3],p[i*3+1],p[i*3+2],n[i*3+2]).alpha===0))continue;
   triangles++;
   const weights=ids.map(i=>{let v=0;for(let k=0;k<4;k++)if(head.has(joints[j[i*4+k]]))v+=w[i*4+k]*ws;return v;});
   for(let y=Math.max(0,Math.floor(Math.min(A.y,B.y,C.y)));y<Math.min(size,Math.ceil(Math.max(A.y,B.y,C.y)));y++)for(let x=Math.max(0,Math.floor(Math.min(A.x,B.x,C.x)));x<Math.min(size,Math.ceil(Math.max(A.x,B.x,C.x)));x++){
    const b0=((B.y-C.y)*(x+.5-C.x)+(C.x-B.x)*(y+.5-C.y))/den,b1=((C.y-A.y)*(x+.5-C.x)+(A.x-C.x)*(y+.5-C.y))/den,b2=1-b0-b1;if(Math.min(b0,b1,b2)<-1e-6)continue;
    const b=[b0,b1,b2],interp=(arr,stride,c)=>ids.reduce((sum,i,k)=>sum+arr[i*stride+c]*b[k],0);
    const f=faceProjection(asset,interp(p,3,0),interp(p,3,1),interp(p,3,2),interp(n,3,2),weights.reduce((v,w,k)=>v+w*b[k],0));
    if(f.alpha<=0||f.u<0||f.u>1||f.v<0||f.v>1)continue;
    const src=(Math.min(rgba.height-1,Math.floor(f.v*rgba.height))*rgba.width+Math.min(rgba.width-1,Math.floor(f.u*rgba.width)))*4,dst=(y*size+x)*4,alpha=Math.round(f.alpha*rgba.data[src+3]);
    if(alpha<data[dst+3])continue;
    data[dst]=rgba.data[src];data[dst+1]=rgba.data[src+1];data[dst+2]=rgba.data[src+2];data[dst+3]=alpha;
   }
  }
 }
 if(!triangles)throw Error('Installed model has no supported facial surface');
 return {data,width:size,height:size,triangles};
}
/** Per-avatar ownership and latest-intent guard. The caller owns its decoded
 * image; this controller owns exactly one derived texture on the current model.
 */
export function createLocalFacePhotoController({getTarget,loadSource,createTexture,bindTexture}){
 let intent=null,version=0,owned=null,disposed=false;
 const release=()=>{if(owned){bindTexture(owned.target,null);owned.texture.dispose?.();owned.texture.destroy?.();owned=null;}};
 return {
  async set(value){
   if(disposed)return false;
   if(value!==null&&(!value||!value.image))throw Error('Invalid local face photo');
   // Copy before the first await: the chooser can close its ImageBitmap as
   // soon as this call settles, and later style changes still have valid pixels.
   const pixels=value?facePhotoPixels(value.image):null;
   intent=value?{revision:value.revision,image:{width:pixels.width,height:pixels.height,data:Uint8Array.from(pixels.data)}}:null;
   const photo=intent;const ticket=++version;release();if(!photo)return true;
   const target=getTarget();if(!target)return false;
   const source=await loadSource(target.asset);
   if(disposed||ticket!==version||getTarget()?.model!==target.model)return false;
   const baked=bakeFacePhoto(source,target.asset,photo.image),texture=createTexture(baked);
   if(disposed||ticket!==version||getTarget()?.model!==target.model){texture.dispose?.();texture.destroy?.();return false;}
   bindTexture(target,texture);owned={target,texture};return true;
  },
  refresh(){return this.set(intent);},
  detach(){++version;release();},
  dispose(){disposed=true;++version;release();intent=null;},
 };
}
