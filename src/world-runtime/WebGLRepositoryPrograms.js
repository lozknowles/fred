import {T} from './vendor/world-engine-contract.js';
import {withWebGLPortalRenderState} from './WebGLPortalViews.js';

/** Start compilation in the real pass signature without drawing repository
 * content. Three's compileAsync does not initialize its private clipping state;
 * an empty offscreen draw does, without linking any repository shaders. All
 * public render state is restored before returning the pending promise.
 *
 * Callers must await each pass before starting another pass on these materials:
 * Three 0.180 polls material.currentProgram rather than a captured program.
 * root ownership/visibility is the caller's synchronous responsibility.
 */
export function compileWebGLRepositoryPass({renderer,camera,root,targetScene,target=null,clippingPlanes=[]}={}){
 if(!renderer?.compileAsync||!root||!targetScene||!camera)throw Error('Repository program preparation dependencies required');
 const initializationTarget=new T.WebGLRenderTarget(1,1),empty=new T.Scene();let pending;
 try{
  pending=withWebGLPortalRenderState(renderer,()=>{
   renderer.clippingPlanes=clippingPlanes;renderer.localClippingEnabled=clippingPlanes.length>0;
   renderer.autoClear=true;if(renderer.xr)renderer.xr.enabled=false;
   renderer.setRenderTarget(initializationTarget);renderer.setScissorTest(false);
   renderer.render(empty,camera);
   renderer.setRenderTarget(target);
   return renderer.compileAsync(root,camera,targetScene);
  });
 }finally{initializationTarget.dispose();}
 return pending;
}
