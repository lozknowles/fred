/** A successful warm is reusable only on this renderer's current context and for
 * the same ordinary mesh resources. This is a draw-work cache, never a world
 * readiness/authorization lease. Unknown rendering behavior takes the full path.
 */
import {T} from './vendor/world-engine-contract.js';
const renderers=new WeakMap(),ids=new WeakMap(),epochs=new WeakMap();let nextId=0;
const id=o=>{if(!o||typeof o!=='object'&&typeof o!=='function')return o;if(!ids.has(o))ids.set(o,++nextId);return ids.get(o);};
function resource(o){if(!o)return null;if(!epochs.has(o)){epochs.set(o,0);o.addEventListener?.('dispose',()=>epochs.set(o,epochs.get(o)+1));}return [id(o),epochs.get(o),o.version];}
const materials=node=>Array.isArray(node.material)?node.material:[node.material];
const textures=node=>materials(node).flatMap(m=>Object.values(m).filter(t=>t?.isTexture));
function snapshot(node,signature){
 const g=node.geometry,attribute=a=>a?[resource(a),id(a.array),a.count,a.itemSize,a.normalized,a.usage,a.offset,a.stride,a.meshPerAttribute,a.gpuType,a.data?attribute(a.data):null]:null;
 return JSON.stringify([signature({root:{traverse:fn=>fn(node)}}),resource(g),Object.entries(g.attributes).map(([k,a])=>[k,attribute(a)]).sort(),attribute(g.index),Object.entries(g.morphAttributes).map(([k,list])=>[k,list.map(attribute)]).sort(),g.drawRange,g.groups,node.count,attribute(node.instanceMatrix),attribute(node.instanceColor),resource(node.morphTexture),materials(node).map(m=>resource(m)?.slice(0,2)),textures(node).map(t=>[resource(t),resource(t.source),id(t.image),t.image?.width,t.image?.height])]);
}
function ordinary(node){
 if(!node.material)return !node.isRenderableObject&&!node.isSprite&&!node.isLine&&!node.isPoints;
 return node.isMesh&&!node.isSkinnedMesh&&!node.isBatchedMesh&&!node.morphTexture&&node.geometry?.isBufferGeometry&&node.onBeforeRender===T.Object3D.prototype.onBeforeRender&&node.onAfterRender===T.Object3D.prototype.onAfterRender&&materials(node).every(m=>['MeshStandardMaterial','MeshPhysicalMaterial','MeshBasicMaterial'].includes(m.type)&&m.onBeforeRender===T.Material.prototype.onBeforeRender);
}
function uploaded(renderer,node){return textures(node).every(t=>{const p=renderer.properties.get(t);return !!p.__webglTexture&&p.__version===t.version;});}
export function planWebGLRepositoryPreparation({renderer,camera,root,targetScene,signature}){
 const nodes=[];let inseparable=false;root.traverse(n=>{if(n.material)nodes.push(n);if(n.material&&materials(n).some(m=>m.uniforms?.extSplats||m.uniforms?.extSplats2))inseparable=true;});
 // Context loss can preserve the JS context object. DOM events invalidate the
 // ledger as well as an explicit isContextLost check.
 const context=renderer.getContext?.(),canvas=renderer.domElement;
 if(!context||typeof context.isContextLost!=='function'||context.isContextLost()||!canvas?.addEventListener||!renderer.capabilities?.isWebGL2||!renderer.properties?.get||!camera?.layers)return {changed:null,commit(){}};
 let state=renderers.get(renderer);if(!state||state.context!==context){state={context,generation:0,nodes:new WeakMap()};renderers.set(renderer,state);for(const event of ['webglcontextlost','webglcontextrestored'])canvas.addEventListener(event,()=>{state.generation++;state.nodes=new WeakMap();});}
 const generation=state.generation,lights=[];for(const scene of [targetScene,root])scene?.traverse(n=>{if(n.isLight)lights.push([id(n),n.type,n.castShadow,n.shadow?.mapSize?.x,n.shadow?.mapSize?.y]);});
 const environment=JSON.stringify([id(targetScene),lights,id(targetScene?.environment),id(targetScene?.fog),targetScene?.fog?.isFogExp2,renderer.toneMapping,renderer.outputColorSpace,renderer.localClippingEnabled,renderer.shadowMap?.enabled,renderer.shadowMap?.type,Object.entries(renderer.capabilities).filter(([,v])=>typeof v!=='function').sort(),camera.type,camera.layers.mask]);
 if(inseparable)return {changed:null,commit(){}};
 const reusable=nodes.filter(ordinary),before=new Map(reusable.map(n=>[n,snapshot(n,signature)])),changed=new Set(nodes.filter(n=>{const r=state.nodes.get(n);return !before.has(n)||!r||r.environment!==environment||r.snapshot!==before.get(n)||!uploaded(renderer,n);}));
 return {changed,total:nodes.length,reusable:reusable.length,commit(){
  if(context.isContextLost()||generation!==state.generation||renderer.getContext()!==context)throw Error('WebGL context changed during repository preparation');
  // Check every snapshot before enrolling any node. Returning ready after an
  // asynchronous resource mutation would let the caller lease an unwarmed graph.
  const current=[];root.traverse(n=>{if(n.material)current.push(n);});
  if(current.length!==nodes.length||current.some((n,index)=>n!==nodes[index]))throw Error('WebGL repository graph changed during preparation');
  for(const n of reusable)if(snapshot(n,signature)!==before.get(n))throw Error('WebGL repository resources changed during preparation');
  for(const n of reusable)if(n.layers.test(camera.layers)&&uploaded(renderer,n))state.nodes.set(n,{environment,snapshot:before.get(n)});
 }};
}
