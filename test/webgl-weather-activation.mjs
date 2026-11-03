import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {primeWebGLWeatherShelter,updateWebGLWeatherShelter,hasPrimedWebGLWeatherShelter} from '../src/world-runtime/WebGLWeatherShelter.js';
import {isEligibleWebGLDepthOccluder} from '../src/world-runtime/WebGLOpaqueDepthPrepass.js';
import {webGLRepositoryReadinessSignature} from '../src/world-runtime/WebGLRepositoryReadiness.js';
const fixture=()=>{const scene=new T.Scene(),camera=new T.PerspectiveCamera(),root=new T.Group(),material=new T.MeshStandardMaterial(),mesh=new T.Mesh(new T.BoxGeometry(),material);root.add(mesh);return {scene,camera,root,material,mesh};};
const shader=()=>({uniforms:{},vertexShader:'#include <fog_vertex>',fragmentShader:'#include <fog_fragment>'});
const exteriorBranch=s=>s.fragmentShader.slice(s.fragmentShader.lastIndexOf('float exterior='),s.fragmentShader.lastIndexOf('#endif')).replace(/\s+/g,'');
test('unvisited fog retains the stock chunk and activated branch retains exact legacy fog arithmetic',()=>{
 const primed=fixture();primeWebGLWeatherShelter(primed,primed.root);const actual=shader();primed.material.onBeforeCompile(actual,{});
 assert.equal(actual.uniforms.weatherShelterActivated.value,false);assert.match(actual.fragmentShader,/if\(!weatherShelterActivated\)\{\s*#include <fog_fragment>\s*\}else\{/);
 const legacy=fixture();legacy.scene.add(legacy.root);updateWebGLWeatherShelter(legacy,null,0,true);const expected=shader();legacy.material.onBeforeCompile(expected,{});
 assert.equal(exteriorBranch(actual),exteriorBranch(expected));assert.equal(actual.vertexShader,expected.vertexShader);
 assert.equal(actual.fragmentShader.slice(actual.fragmentShader.indexOf('uniform int weatherShelterCount'),actual.fragmentShader.indexOf('if(!weatherShelterActivated)')).trim(),expected.fragmentShader.slice(0,expected.fragmentShader.indexOf('#ifdef USE_FOG')).trim());
});
test('first activation and repeated priming preserve hooks, keys, shader version and readiness signature',()=>{
 const f=fixture();primeWebGLWeatherShelter(f,f.root);const hook=f.material.onBeforeCompile,key=f.material.customProgramCacheKey,version=f.material.version,signature=webGLRepositoryReadinessSignature(f),compiled=shader();hook.call(f.material,compiled,{});
 assert.equal(f.scene.children.length,0,'priming does not create or draw rain');primeWebGLWeatherShelter(f,f.root);assert.equal(f.material.version,version);
 f.scene.add(f.root);updateWebGLWeatherShelter(f,null,0,true);assert.equal(compiled.uniforms.weatherShelterActivated.value,true);assert.equal(f.material.onBeforeCompile,hook);assert.equal(f.material.customProgramCacheKey,key);assert.equal(f.material.version,version);assert.equal(webGLRepositoryReadinessSignature(f),signature);
 f.root.removeFromParent();updateWebGLWeatherShelter(f,null,1,true);assert.equal(compiled.uniforms.weatherShelterActivated.value,true,'visited preview policy persists after leaving active scene');
});
test('shared materials switch together while distinct unvisited preview materials ignore shared active weather uniforms',()=>{
 const f=fixture(),second=new T.Group();second.add(new T.Mesh(f.mesh.geometry,f.material));primeWebGLWeatherShelter(f,f.root);const version=f.material.version;primeWebGLWeatherShelter(f,second);assert.equal(f.material.version,version);
 const unvisited=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()),preview=new T.Group();preview.add(unvisited);primeWebGLWeatherShelter(f,preview);
 const a=shader(),b=shader();f.material.onBeforeCompile(a,{});unvisited.material.onBeforeCompile(b,{});f.scene.add(second);updateWebGLWeatherShelter(f,null,0,true);
 assert.equal(a.uniforms.weatherShelterActivated.value,true);assert.equal(b.uniforms.weatherShelterActivated.value,false);assert.equal(a.uniforms.weatherShelterCount,b.uniforms.weatherShelterCount,'same uniform ownership as legacy visited previews');
 const other=fixture();assert.throws(()=>primeWebGLWeatherShelter(other,preview),/another engine/);
});
test('depth prepass permits only exact unified installer over default compile behavior',()=>{
 const f=fixture();primeWebGLWeatherShelter(f,f.root);f.scene.add(f.root);assert.equal(isEligibleWebGLDepthOccluder(f.mesh),true);assert.equal(hasPrimedWebGLWeatherShelter(f.material,f.scene.userData.weatherShelter),true);
 const hook=f.material.onBeforeCompile,key=f.material.customProgramCacheKey;f.material.onBeforeCompile=()=>{};assert.equal(isEligibleWebGLDepthOccluder(f.mesh),false);f.material.onBeforeCompile=hook;f.material.customProgramCacheKey=()=>key();assert.equal(isEligibleWebGLDepthOccluder(f.mesh),false);
 const custom=fixture();custom.material.onBeforeCompile=s=>s.vertexShader+='gl_Position.x+=1.0;';primeWebGLWeatherShelter(custom,custom.root);custom.scene.add(custom.root);assert.equal(isEligibleWebGLDepthOccluder(custom.mesh),false);
});
