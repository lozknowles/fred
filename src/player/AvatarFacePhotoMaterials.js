import {Texture} from '../engine/gpu/Texture.js';

// Private texture is deliberately outside avatarUniforms (which contains only
// appearance colours) and outside transport uniforms and peer serialization.
export function nativeFaceTexture(atlas){return new Texture({label:'local-private-face',...atlas,format:'rgba8unorm-srgb',sampler:'linearClamp'});}
export function bindNativeFaceTexture({model},texture){
 for(const material of model.materials){
  if(material.name!=='skinned-head')continue;
  if(!Object.hasOwn(material.userData,'localFaceOriginalSurface'))material.userData.localFaceOriginalSurface=material.surface;
  if(texture){material.bindings.localFacePhoto={texture};material.surface=material.userData.localFaceOriginalSurface+`
   let localFace=textureSample(localFacePhoto,smpLinearClamp,in.uv);
   if(i32(round(orm.r*5.0))==3){s.albedo=mix(s.albedo,localFace.rgb,localFace.a);}
  `;}else{delete material.bindings.localFacePhoto;material.surface=material.userData.localFaceOriginalSurface;}
  material.needsUpdate=true;
 }
}
export function webGLFaceTexture(T,atlas){
 const texture=new T.DataTexture(atlas.data,atlas.width,atlas.height,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.flipY=false;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}
export function bindWebGLFaceTexture({model},texture){
 model.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material]){
  if(material?.name!=='head')continue;
  let state=material.userData.localFacePhoto;
  if(!state&&!texture)continue;
  if(!state){
   // Three can reuse a cached program without calling onBeforeCompile again.
   // Keep uniform identities and program shape stable after the first opt-in;
   // rebinding must update the objects already captured by the compiled shader.
   state=material.userData.localFacePhoto={sampler:{value:null},enabled:{value:0},previous:material.onBeforeCompile,key:material.customProgramCacheKey()};
   material.onBeforeCompile=function(shader,renderer){
    state.previous.call(this,shader,renderer);
    shader.uniforms.localFacePhoto=state.sampler;shader.uniforms.localFaceEnabled=state.enabled;
    shader.fragmentShader='uniform sampler2D localFacePhoto;uniform float localFaceEnabled;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     if(localFaceEnabled>0.5){
      vec4 localFace=texture2D(localFacePhoto,vMapUv);
      if(floor(texture2D(avatarZoneMap,vMapUv).r*5.0+0.5)==3.0)diffuseColor.rgb=mix(diffuseColor.rgb,localFace.rgb,localFace.a);
     }
    `);
   };
   material.customProgramCacheKey=()=>state.key+'|local-face-photo-v2';material.needsUpdate=true;
  }
  // Original albedo is owned by the model and remains alive until model disposal.
  // The disabled branch does not sample it; null uses Three's own empty fallback.
  state.sampler.value=texture??material.map??null;state.enabled.value=texture?1:0;
 }});
}
