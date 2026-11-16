import {loadWorldSource,describeRuntimeWorld,landscapeChunks,sampleTerrain,createSplatSceneResourceReader,registerNativeIslandResourceReader} from './vendor/world-engine-contract.js';
// Private to this software version and the exact project object. No persistent
// or cross-world authority cache. The contract is used unchanged for every new pin.
const chunksByProject=new WeakMap();
export const publishedLandscapeChunks=project=>chunksByProject.get(project)??landscapeChunks(project);
function assertPin(identity,entry){if(identity.worldId!==entry.worldId||identity.contentDigest!==entry.contentDigest)throw Error('Published content identity changed');}
export async function verifyPublishedData(source,entry){
 const loaded=await loadWorldSource(source);assertPin(loaded.identity,entry);
 const {terrain,...descriptor}=describeRuntimeWorld(loaded.project);
 // Run the original landscape admission, finite-bounds and capacity checks.
 const chunks=landscapeChunks(descriptor.project);
 return {identity:loaded.identity,project:loaded.project,manifest:loaded.manifest,contentDigest:loaded.contentDigest,descriptor,chunks};
}
export function restorePublishedData(data,source,entry){
 const {identity,project,manifest,contentDigest,descriptor,chunks}=data;assertPin(identity,entry);
 if(contentDigest!==entry.contentDigest||descriptor.worldId!==entry.worldId||!(chunks instanceof Map))throw Error('Invalid published admission result');
 registerNativeIslandResourceReader(project,source.read);
 const loaded={identity,project,manifest,contentDigest,source};
 if(project.nativeIsland)loaded.nativeIslandRead=source.read;
 if(project.splatScene)loaded.splatSceneRead=createSplatSceneResourceReader(project,source.read).read;
 chunksByProject.set(descriptor.project,chunks);
 return {loaded,descriptor:{...descriptor,terrain:{heightAt:(x,z)=>sampleTerrain(descriptor.project.terrain,x,z)}}};
}
