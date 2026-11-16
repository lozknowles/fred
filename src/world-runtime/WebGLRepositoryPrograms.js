import {T} from './vendor/world-engine-contract.js';
import {isQualifiedWarehousePlantOcclusion} from './WebGLOpaqueDepthPrepass.js';
import {SHIFT_WORLD_ID, SHIFT_CONTENT_DIGEST} from './ShiftingWorldProfile.js';
import {withWebGLPortalRenderState} from './WebGLRenderState.js';

export function isQualifiedFirstTripPackage(kind,identity){
 return kind==='published' && (isQualifiedWarehousePlantOcclusion(identity) ||
  (identity?.worldId==='elsemesh.world:63121706-d439-4091-95b0-780b7d8563e8' && identity.contentDigest==='36e60f42dffa422ef20dce60a14a9da238ccce49eb96e248dc5952f6b3429808') ||
  (identity?.worldId===SHIFT_WORLD_ID && identity.contentDigest===SHIFT_CONTENT_DIGEST));
}

/** Start compilation in the real pass signature without drawing repository
 * content. Three's compile does not initialize its private clipping state;
 * an empty offscreen draw does, without linking any repository shaders. All
 * public render state is restored before returning the pending promise.
 *
 * Capture the submitted Three 0.180 program wrappers, including both transparent
 * faces. Their isReady only queries KHR completion; unlike compileAsync, no
 * unmanaged timer follows mutable material properties after resource retirement.
 * Without KHR, Three reports ready immediately (the legacy synchronous fallback).
 * root ownership/visibility is the caller's synchronous responsibility.
 */
export function compileWebGLRepositoryPass({renderer,camera,root,targetScene,target=null,clippingPlanes=[],signal,timeoutMs=30000,initializeClipping=true}={}){
 if(!renderer?.compile||!root||!targetScene||!camera)throw Error('Repository program preparation dependencies required');
 const context=renderer.getContext?.(),canvas=renderer.domElement,events=['webglcontextlost','webglcontextrestored'];let changed=false,timer,settled=false,rejectWait;
 const retired=()=>Error('WebGL renderer context retired during repository preparation');
 const assertLive=()=>{if(signal?.aborted||changed||renderer.getContext?.()!==context||context?.isContextLost?.())throw retired();};
 const cleanup=()=>{clearTimeout(timer);for(const event of events)canvas?.removeEventListener?.(event,onRetire);signal?.removeEventListener('abort',onRetire);};
 const onRetire=()=>{changed=true;if(rejectWait&&!settled){settled=true;cleanup();rejectWait(retired());}};
 for(const event of events)canvas?.addEventListener?.(event,onRetire);signal?.addEventListener('abort',onRetire,{once:true});
 const initializationTarget=initializeClipping?new T.WebGLRenderTarget(1,1):null,empty=new T.Scene();let programs;
 const submit=()=>{
  const materials=renderer.compile(root,camera,targetScene),wrappers=new Set();
  if(!(materials instanceof Set)||typeof renderer.properties?.get!=='function')throw Error('Unsupported Three material program contract');
  for(const material of materials){
   if(!material?.isMaterial)throw Error('Unsupported Three material program contract');
   const variants=renderer.properties.get(material)?.programs;
   if(!(variants instanceof Map)||variants.size===0)throw Error('Unsupported Three material program contract');
   // A participating material can have two transparent faces or variants from
   // multiple meshes. Include every cached variant, but never another world's
   // unrelated entries in renderer.info.programs.
   for(const wrapper of variants.values()){
    if(!wrapper||typeof wrapper.isReady!=='function')throw Error('Unsupported Three program readiness contract');
    wrappers.add(wrapper);
   }
  }
  programs=[...wrappers].map(wrapper=>({wrapper,handle:wrapper.program}));
 };
 try{
  assertLive();if(initializeClipping)withWebGLPortalRenderState(renderer,()=>{
   renderer.clippingPlanes=clippingPlanes;renderer.localClippingEnabled=clippingPlanes.length>0;
   renderer.autoClear=true;if(renderer.xr)renderer.xr.enabled=false;
   renderer.setRenderTarget(initializationTarget);renderer.setScissorTest(false);
   renderer.render(empty,camera);
   renderer.setRenderTarget(target);
   submit();
  });else submit(); // Legacy caller has already initialized and scoped render state.
  assertLive();
 }catch(error){cleanup();throw error;}finally{initializationTarget?.dispose();}
 return new Promise((resolve,reject)=>{
  rejectWait=reject;const deadline=Date.now()+timeoutMs;
  const poll=()=>{
   if(settled)return;
   try{
    assertLive();if(Date.now()>=deadline)throw Error('WebGL repository program preparation timed out');
    let ready=true;for(const {wrapper,handle}of programs){
     if(!handle||wrapper.program!==handle)throw Error('WebGL repository program retired during preparation');
     if(typeof wrapper.isReady!=='function')throw Error('Unsupported Three program readiness contract');
     ready=wrapper.isReady()&&ready;
    }
    if(ready){settled=true;cleanup();resolve(root);}else timer=setTimeout(poll,10);
   }catch(error){settled=true;cleanup();reject(error);}
  };poll();
 });
}
