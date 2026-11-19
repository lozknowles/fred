import {createNativeIslandResourceReader} from './vendor/world-engine-contract.js';
import {readNativeIslandSource} from './NativeIslandSource.js';
export function nativeIslandSceneOptions(project,loaded,water,{captureWebGLCanopy=false}={}){
 if(!project.nativeIsland)return {};
 if(typeof loaded?.nativeIslandRead!=='function')throw Error('Native island requires its pinned repository resource reader.');
 return {nativeIsland:{readNativeIsland:()=>readNativeIslandSource(project,createNativeIslandResourceReader(project,loaded.nativeIslandRead),{captureCanopy:captureWebGLCanopy}),...(water?{water}: {})}};
}
export function nativeIslandDiagnostics(active,backend){
 if(!active?.nativeIsland)return null;
 return {backend,backendQualification:backend==='webgpu'?'native-render-path-awaiting-browser-qualification':'unqualified-optical-equivalence',...active.nativeIsland.stats()};
}
