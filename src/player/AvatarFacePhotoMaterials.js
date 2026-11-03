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
  if(!state){
   state=material.userData.localFacePhoto={texture:null,previous:material.onBeforeCompile,key:material.customProgramCacheKey()};
   material.onBeforeCompile=function(shader,renderer){
    state.previous.call(this,shader,renderer);if(!state.texture)return;
    shader.uniforms.localFacePhoto={value:state.texture};
    shader.fragmentShader='uniform sampler2D localFacePhoto;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     vec4 localFace=texture2D(localFacePhoto,vMapUv);
     if(floor(texture2D(avatarZoneMap,vMapUv).r*5.0+0.5)==3.0)diffuseColor.rgb=mix(diffuseColor.rgb,localFace.rgb,localFace.a);
    `);
   };
   material.customProgramCacheKey=()=>state.key+(state.texture?'|local-face-photo-v1':'');
  }
  state.texture=texture;material.needsUpdate=true;
 }});
}
