import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {terrainMaterial} from '../src/world-runtime/WebGLNativeIsland.js';

function shaderFor(coarse=false,windDirection=.7){
 const tex=new T.Texture(),material=terrainMaterial({normal:tex,splat:tex,detail:tex,shore:tex,grass:tex,ready:tex,rect:[-4,-4,8,8],domain:{origin:-4,size:8},coarse,time:{value:0},windDirection});
 const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};
 material.onBeforeCompile(shader);material.dispose();tex.dispose();return shader;
}
const expand=shader=>shader.replace(/#include <([\w]+)>/g,(_,name)=>{assert.ok(T.ShaderChunk[name]!==undefined,`missing Three chunk ${name}`);return expand(T.ShaderChunk[name]);});

test('both terrain variants assemble against installed Three chunks within WebGL2 sampler limits',()=>{
 for(const coarse of [false,true]){
  const shader=shaderFor(coarse),fragment=expand(shader.fragmentShader),vertex=expand(shader.vertexShader);
  assert.ok(!fragment.includes('#include'));assert.ok(!vertex.includes('#include'));
  assert.equal((fragment.match(/float terrainRough=/g)||[]).length,1);
  assert.ok(fragment.indexOf('float terrainRough=')<fragment.indexOf('roughnessFactor=clamp(terrainRough'));
  assert.ok(fragment.indexOf('float terrainHeight=')<fragment.indexOf('nativeTerrainBump(vNativeWorld,terrainN,terrainHeight)'));
  const nativeSamplers=fragment.match(/uniform sampler2D nativeNormal,([^;]+);/)[1].split(',');
  assert.equal(nativeSamplers.length+1,6); // no additional textures or render targets
  assert.equal(shader.fragmentShader.includes('if(texture2D(nativeReady,domainUv).r>.5)discard;'),coarse);
  assert.ok(!/texture2D\([^;]+\?/.test(fragment)); // all detail samples run uniformly
 }
});

test('near beach relief uses captured wind, phase footprint and static wet roughness',()=>{
 const {fragmentShader:f,uniforms}=shaderFor(false,.7);
 assert.deepEqual(uniforms.nativeTerrainWind.value.toArray(),[Math.sin(.7),Math.cos(.7)]);
 assert.match(f,/6\.2832\/\.105/);assert.match(f,/fwidth\(phase\)/);
 assert.match(f,/rip\*\.005\*windK/);assert.match(f,/roughnessFactor=clamp\(terrainRough/);
 assert.match(f,/normal=normalize\(mat3\(viewMatrix\)\*nativeTerrainBump/);
 assert.match(f,/smoothstep\(\.12,\.35,frame\)\*smoothstep\(\.3,\.6,facet\)/);
 assert.match(f,/normalize\(N-grad\/max\(ad,1e-20\)\)/);
 assert.match(f,/strataAA=1\.0-smoothstep\(\.15,\.6,fwidth\(bandY\)\)/);
 // The static fallback must not animate with the live analytic ocean clock.
 assert.equal((f.match(/nativeTime/g)||[]).length,1);
 assert.ok(f.indexOf('dryRock=')<f.indexOf('lichen='));
});
