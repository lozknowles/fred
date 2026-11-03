import {nativeIslandSceneOptions} from './NativeIslandIntegration.js';
export function repositorySceneOptions(project,loaded,{renderer,backend,water,camera}={}){
 if(project.splatScene){
  if(backend!=='webgl2'||!renderer)throw Error('This experimental splat world requires the WebGL graphics mode.');
  if(typeof loaded?.splatSceneRead!=='function')throw Error('Splat scene requires its verified repository resource reader.');
  return {splatScene:{read:loaded.splatSceneRead,renderer}};
 }
 const options=nativeIslandSceneOptions(project,loaded,water);
 // Host preparation uses an isolated camera clone. Occlusion admission must use
 // the renderer's actual main camera, never that temporary preparation view.
 if(options.nativeIsland&&backend==='webgl2'&&camera)options.nativeIsland.mainCamera=camera;
 return options;
}
