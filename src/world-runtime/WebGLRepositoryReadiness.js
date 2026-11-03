import {managedSparkTextureIdentity} from './SplatReadinessContract.js';
import {T} from './vendor/world-engine-contract.js';
import {planWebGLRepositoryPreparation} from './WebGLRepositoryPreparationCache.js';
import {compileWebGLRepositoryPass} from './WebGLRepositoryPrograms.js';
import {withWebGLPortalRenderState} from './WebGLPortalViews.js';
/** Readiness mutations restore synchronously before every GPU wait. */
export async function prepareWebGLRepositoryResources({renderer,camera,root,targetScene}={}){
 if(!root||!renderer)throw Error('WebGL preparation dependencies required');
 const fallback={changed:null,commit(){}};
 const preparation=root.userData.repositoryActualPassPreparation?planWebGLRepositoryPreparation({renderer,camera,root,targetScene,signature:webGLRepositoryReadinessSignature}):fallback;
 const metrics={total:preparation.total??null,reusable:preparation.reusable??0,changed:preparation.changed?.size??null,fullFallback:preparation.changed===null};
 if(preparation.changed?.size===0)return {ready:true,preparation:metrics};
 const scene=new T.Scene();for(const n of targetScene?.children??[])if(n.isLight)scene.add(n.clone());
 const actual=preparation!==fallback&&preparation.changed!==null;
 if(actual){scene.fog=targetScene?.fog;scene.environment=targetScene?.environment;}
 const target=new T.WebGLRenderTarget(1,1,actual?{type:T.HalfFloatType}:{}),planes=[new T.Plane(new T.Vector3(0,0,1),0)];
 const mutate=operation=>{
  const parent=root.parent,index=parent?.children.indexOf(root),visibility=[],oldLOD=renderer.presentationLODPreparing;
  root.traverse(n=>{visibility.push([n,n.visible,n.frustumCulled,n.layers.mask]);n.visible=true;if(n.isMesh)n.frustumCulled=false;if(n.material&&preparation.changed&&!preparation.changed.has(n))n.layers.mask=0;});
  try{scene.add(root);renderer.presentationLODPreparing=true;return operation();}
  finally{root.removeFromParent();if(parent){parent.add(root);const at=parent.children.indexOf(root);parent.children.splice(at,1);parent.children.splice(index,0,root);}for(const[n,visible,cull,layers]of visibility){n.visible=visible;n.frustumCulled=cull;n.layers.mask=layers;}renderer.presentationLODPreparing=oldLOD;}
 };
 try{
  if(actual){
   // Three 0.180 compile traverses every material regardless of visibility/layers.
   // This traversal facade preserves the real objects/features while limiting
   // compilation to the same changed subset used by the upload draw.
   const compileRoot={traverse:visit=>root.traverse(n=>{if(n.material&&preparation.changed.has(n))visit(n);}),traverseVisible(){}};
   await mutate(()=>compileWebGLRepositoryPass({renderer,camera,root:compileRoot,targetScene:scene}));
   await mutate(()=>compileWebGLRepositoryPass({renderer,camera,root:compileRoot,targetScene:scene,target,clippingPlanes:planes}));
   mutate(()=>withWebGLPortalRenderState(renderer,()=>{renderer.setRenderTarget(target);renderer.clippingPlanes=planes;renderer.localClippingEnabled=true;renderer.autoClear=true;renderer.setScissorTest(false);if(renderer.xr)renderer.xr.enabled=false;renderer.render(scene,camera);}));
  }else{
   let wait;mutate(()=>{const oldTarget=renderer.getRenderTarget(),oldPlanes=renderer.clippingPlanes,oldAuto=renderer.autoClear;try{renderer.setRenderTarget(target);renderer.autoClear=true;renderer.clippingPlanes=[];renderer.render(scene,camera);renderer.clippingPlanes=planes;renderer.render(scene,camera);wait=renderer.compileAsync(scene,camera,targetScene);}finally{renderer.clippingPlanes=oldPlanes;renderer.autoClear=oldAuto;renderer.setRenderTarget(oldTarget);}});await wait;
  }
  preparation.commit();return {ready:true,preparation:metrics};
 }finally{target.dispose();scene.clear();}
}

const functionIds=new WeakMap();let nextFunction=0;
const functionIdentity=fn=>{if(typeof fn!=='function')return null;if(!functionIds.has(fn))functionIds.set(fn,++nextFunction);return functionIds.get(fn);};
const supportedMaterialTypes=new Set(['MeshStandardMaterial','MeshPhysicalMaterial','MeshBasicMaterial','ShaderMaterial']);
const programFlags=['side','transparent','forceSinglePass','alphaTest','alphaHash','alphaToCoverage','premultipliedAlpha','vertexColors','flatShading','wireframe','fog','lights','toneMapped','dithering','normalMapType','glslVersion','sizeAttenuation','depthTest','depthWrite','blending'];
const textureIdentity=t=>t?.isTexture?[t.id,t.mapping,t.channel,t.colorSpace,t.format,t.type,t.flipY,t.minFilter,t.magFilter,t.wrapS,t.wrapT]:null;
/** Three mutates material.version for every double-sided transparent draw. This
 * signature records supported shader/resource structure, outside render callbacks.
 * Per-frame transforms, ordinary uniforms and renderer-owned versions are excluded.
 */
export function webGLRepositoryReadinessSignature(candidate){
 const nodes=[];try{candidate.root.traverse(node=>{
  if(!node.material)return;const geometry=node.geometry;
  const features={instanced:!!node.isInstancedMesh,skinned:!!node.isSkinnedMesh,batched:!!node.isBatchedMesh,attributes:Object.entries(geometry?.attributes??{}).map(([key,a])=>[key,a.itemSize,a.normalized,a.array?.constructor.name]).sort(),morph:Object.entries(geometry?.morphAttributes??{}).map(([key,a])=>[key,a.length,a[0]?.itemSize]).sort(),relative:geometry?.morphTargetsRelative};
  const materials=(Array.isArray(node.material)?node.material:[node.material]).map(m=>{
   if(!supportedMaterialTypes.has(m.type))throw Error('WebGL material requires explicit preparation support: '+m.type);
   const flags=Object.fromEntries(programFlags.map(k=>[k,m[k]])),textures=Object.entries(m).filter(([k,v])=>k==='map'||k.endsWith('Map')&&v?.isTexture).map(([k,v])=>[k,textureIdentity(v)]).sort();
   const uniformTextures=Object.entries(m.uniforms??{}).filter(([,u])=>u?.value?.isTexture).map(([k,u])=>[k,managedSparkTextureIdentity(candidate,node,m,k,u.value,textureIdentity(u.value))]).sort();
   return {id:m.id,type:m.type,flags,textures,uniformTextures,defines:Object.entries(m.defines??{}).sort(),vertexShader:m.vertexShader,fragmentShader:m.fragmentShader,cacheKey:m.customProgramCacheKey?.(),compileHook:functionIdentity(m.onBeforeCompile)};
  });nodes.push({features,materials});
 });}catch(error){if(error?.reason){error.signatureCallSites=(new Error().stack??'').split('\n').slice(1,5).map(line=>line.trim().replace(/\?[^ )]*/g,''));error.message+=' Signature caller '+JSON.stringify(error.signatureCallSites);}throw error;}return JSON.stringify({contract:'repository-webgl/main+global-clip+double-side/1',nodes});
}
