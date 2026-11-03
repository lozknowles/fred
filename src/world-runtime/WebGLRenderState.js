import {T} from './vendor/world-engine-contract.js';

/** All renderer changes are synchronous, including failure restoration. */
export function withWebGLPortalRenderState(renderer,draw){
 const r=renderer,state={toneMapping:r.toneMapping,target:r.getRenderTarget(),cube:r.getActiveCubeFace?.()??0,mip:r.getActiveMipmapLevel?.()??0,viewport:r.getViewport(new T.Vector4()),scissor:r.getScissor(new T.Vector4()),scissorTest:r.getScissorTest(),clip:r.clippingPlanes,localClip:r.localClippingEnabled,autoClear:r.autoClear,clearColor:r.getClearColor(new T.Color()).clone(),clearAlpha:r.getClearAlpha(),xr:r.xr?.enabled};
 try{return draw();}
 finally{r.toneMapping=state.toneMapping;r.clippingPlanes=state.clip;r.localClippingEnabled=state.localClip;r.autoClear=state.autoClear;if(r.xr)r.xr.enabled=state.xr;r.setRenderTarget(state.target,state.cube,state.mip);r.setViewport(state.viewport);r.setScissor(state.scissor);r.setScissorTest(state.scissorTest);r.setClearColor(state.clearColor,state.clearAlpha);}
}
