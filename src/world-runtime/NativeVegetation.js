import {T} from './vendor/world-engine-contract.js';
import {nativeLeafAtlasMetadata} from './NativeLeafAtlasData.js';
import {leafAtlasPath} from './WarehouseGraphicsAssets.js';
export {NATIVE_VEGETATION_SURFACE_GLSL} from './NativeVegetationSurface.js';
export {nativeLeafAtlasMetadata};

export const nativeLeafAtlasURL = (import.meta.env?.BASE_URL ?? './') + leafAtlasPath;
export async function loadNativeLeafAtlas(){
 const response=await fetch(nativeLeafAtlasURL);if(!response.ok)throw Error('Native leaf atlas could not be loaded.');
 const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'});
 if(bitmap.width!==nativeLeafAtlasMetadata.size||bitmap.height!==nativeLeafAtlasMetadata.size){bitmap.close();throw Error('Native leaf atlas dimensions differ.');}
 const texture=new T.Texture(bitmap);texture.name='native-source-leaf-clusters';texture.colorSpace=T.NoColorSpace;texture.flipY=false;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;
 texture.addEventListener('dispose',()=>bitmap.close());return texture;
}
const color=hex=>`vec3(${new T.Color(hex).toArray().map(n=>n.toFixed(6)).join(',')})`;
export const NATIVE_CANOPY_COLOR_GLSL=/* glsl */`
 bool isShrub=vNativePart.x>2.5;
 float tile=vegLeafTile(vNativeSeed,isShrub);
 vec2 atlasUv=(vec2(fract(tile*.5)*2.0,floor(tile*.5))+clamp(vNativeUv,vec2(.004),vec2(.996)))*.5;
 // The offline PNG's first row is logical v=0; no render-target inversion is needed.
 vec4 L=texture2D(nativeLeafAtlas,atlasUv);
 vec3 face=cross(dFdx(-vViewPosition),dFdy(-vViewPosition));
 float facing=abs(dot(normalize(face),normalize(vViewPosition)));
 float threshold=vegCoverageThreshold(vNativeUv)+(1.0-vegSmooth(.08,.35,facing))*.45;
 if(L.r<=threshold)discard;
 float cell=L.b,ao=vNativePart.y,spS=vegShrubSpecies(vNativeSeed);
 vec3 c=vegCanopyLeafColor(vNativeSeed,vNativePart.z,isShrub)*(L.g*1.4);
 c=mix(c,${color(0x7a3a22)},vegSmooth(.86,.98,cell)*.55*((isShrub&&spS<.5)?1.0:0.0));
 vec3 vari=fract(cell*7.3)>.5?${color(0x9a8a30)}:${color(0x7a3a22)};
 c=mix(c,vari,vegSmooth(.72,.9,cell)*.55*((isShrub&&spS==1.0)?1.0:0.0));
 if(isShrub&&spS>1.5&&cell>.92)c=${color(0xb3261e)};
 c=mix(c,mix(${color(0x8a7a3a)},${color(0x7e3e22)},step(.992,fract(cell*3.7))),step(.984,fract(cell*3.7))*(isShrub?0.0:1.0)*.6);
 c=mix(c,c*vec3(1.16,1.22,.92),vegSmooth(.62,1.0,ao)*.7);
 diffuseColor.rgb*=c*mix(.55,1.0,ao);
`;
